import { createClient, RedisClientType } from "redis";
import logger from "../utils/logger";
import { User, IUser } from "../models";

/**
 * Кэшированный статус пользователя
 * Используется для быстрой проверки доступа без обращения к БД
 */
export interface CachedUserStatus {
  userId: number;
  isAdmin: boolean;
  isBanned: boolean;
  hasActiveSubscription: boolean;
  subscriptionExpiresAt: string | null;
  hasActiveTrial: boolean;
  trialExpiresAt: string | null;
  preferredLanguage: "ru" | "en";
  cachedAt: string;
}

/**
 * UserCacheService - кэширование статусов пользователей в Redis
 *
 * Решает проблемы:
 * 1. Частые запросы к БД для проверки подписки/триала
 * 2. Высокая нагрузка при большом количестве пользователей
 *
 * Особенности:
 * - TTL 60 секунд - быстрая инвалидация при оплате
 * - Batch загрузка для списка пользователей
 * - Автоматическая инвалидация при изменениях
 */
class UserCacheService {
  private redisClient: RedisClientType | null = null;
  private initialized = false;
  private readonly TTL = 60; // 60 секунд - короткий TTL для актуальности данных подписки
  private readonly KEY_PREFIX = "user:status:";

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      // Build Redis connection URL from environment variables
      // REDIS_URL takes precedence, otherwise build from individual vars
      const redisUrl = process.env.REDIS_URL || this.buildRedisUrl();

      this.redisClient = createClient({ url: redisUrl });

      this.redisClient.on("error", (err) => {
        logger.error(undefined, "UserCacheService Redis error:", err);
      });

      this.redisClient.on("reconnecting", () => {
        logger.warn(undefined, "UserCacheService Redis reconnecting...");
      });

      await this.redisClient.connect();
      this.initialized = true;
      logger.info(undefined, `UserCacheService initialized, connected to Redis`);
    } catch (error) {
      logger.error(undefined, "Error initializing UserCacheService:", error);
      // Продолжаем работу без кэша - fallback на БД
    }
  }

  private buildRedisUrl(): string {
    const host = process.env.REDIS_HOST || "localhost";
    const port = process.env.REDIS_PORT || "6379";
    const password = process.env.REDIS_PASSWORD;
    const db = process.env.REDIS_DB || "0";

    // Format: redis://[[username:]password@]host[:port][/database]
    if (password) {
      return `redis://:${password}@${host}:${port}/${db}`;
    }
    return `redis://${host}:${port}/${db}`;
  }

  private getKey(userId: number): string {
    return `${this.KEY_PREFIX}${userId}`;
  }

  /**
   * Получить статус пользователя (из кэша или БД)
   */
  async getUserStatus(userId: number): Promise<CachedUserStatus | null> {
    // Попробовать из кэша
    const cached = await this.getFromCache(userId);
    if (cached) {
      return cached;
    }

    // Загрузить из БД
    const user = await User.findOne({ user_id: userId });
    if (!user) {
      return null;
    }

    const status = this.buildStatus(user);
    await this.setToCache(userId, status);
    return status;
  }

  /**
   * Batch загрузка статусов для списка пользователей
   * Оптимизировано для обработки большого количества сигналов
   */
  async getUserStatuses(userIds: number[]): Promise<Map<number, CachedUserStatus>> {
    const result = new Map<number, CachedUserStatus>();
    if (!userIds.length) return result;

    // Получить из кэша
    const cachedStatuses = await this.getMultipleFromCache(userIds);
    const missingIds: number[] = [];

    for (const userId of userIds) {
      const cached = cachedStatuses.get(userId);
      if (cached) {
        result.set(userId, cached);
      } else {
        missingIds.push(userId);
      }
    }

    // Загрузить отсутствующие из БД одним запросом
    if (missingIds.length > 0) {
      const users = await User.find({ user_id: { $in: missingIds } }).lean();

      for (const user of users) {
        const status = this.buildStatus(user as IUser);
        result.set(Number(user.user_id), status);
        // Кэшировать асинхронно (не ждём)
        this.setToCache(Number(user.user_id), status).catch(() => {});
      }
    }

    return result;
  }

  /**
   * Проверить, имеет ли пользователь доступ к сигналам
   * Быстрый метод для частых проверок
   */
  async hasAccess(userId: number): Promise<boolean> {
    const status = await this.getUserStatus(userId);
    if (!status) return false;
    if (status.isBanned) return false;
    if (status.isAdmin) return true;

    const now = new Date();

    // Проверить подписку
    if (status.hasActiveSubscription && status.subscriptionExpiresAt) {
      if (new Date(status.subscriptionExpiresAt) > now) {
        return true;
      }
    }

    // Проверить триал
    if (status.hasActiveTrial && status.trialExpiresAt) {
      if (new Date(status.trialExpiresAt) > now) {
        return true;
      }
    }

    return false;
  }

  /**
   * Инвалидировать кэш пользователя
   * Вызывать при:
   * - Оплате подписки
   * - Старте триала
   * - Изменении статуса (бан, админ)
   */
  async invalidate(userId: number): Promise<void> {
    if (!this.initialized || !this.redisClient) return;

    try {
      await this.redisClient.del(this.getKey(userId));
      logger.debug(undefined, `User cache invalidated for userId: ${userId}`);
    } catch (error) {
      logger.error(undefined, `Error invalidating user cache for ${userId}:`, error);
    }
  }

  /**
   * Инвалидировать и обновить кэш
   */
  async invalidateAndRefresh(userId: number): Promise<CachedUserStatus | null> {
    await this.invalidate(userId);
    return this.getUserStatus(userId);
  }

  /**
   * Получить статистику кэша
   */
  async getStats(): Promise<{ totalCached: number; isConnected: boolean }> {
    if (!this.initialized || !this.redisClient) {
      return { totalCached: 0, isConnected: false };
    }

    try {
      const keys = await this.redisClient.keys(`${this.KEY_PREFIX}*`);
      return {
        totalCached: keys.length,
        isConnected: this.redisClient.isOpen,
      };
    } catch {
      return { totalCached: 0, isConnected: false };
    }
  }

  // === Приватные методы ===

  private async getFromCache(userId: number): Promise<CachedUserStatus | null> {
    if (!this.initialized || !this.redisClient) return null;

    try {
      const data = await this.redisClient.get(this.getKey(userId));
      if (data) {
        return JSON.parse(data) as CachedUserStatus;
      }
    } catch (error) {
      logger.error(undefined, `Error getting user cache for ${userId}:`, error);
    }
    return null;
  }

  private async getMultipleFromCache(userIds: number[]): Promise<Map<number, CachedUserStatus>> {
    const result = new Map<number, CachedUserStatus>();
    if (!this.initialized || !this.redisClient || !userIds.length) return result;

    try {
      const keys = userIds.map((id) => this.getKey(id));
      const values = await this.redisClient.mGet(keys);

      values.forEach((val, idx) => {
        if (val) {
          try {
            result.set(userIds[idx], JSON.parse(val) as CachedUserStatus);
          } catch {}
        }
      });
    } catch (error) {
      logger.error(undefined, "Error getting multiple user caches:", error);
    }

    return result;
  }

  private async setToCache(userId: number, status: CachedUserStatus): Promise<void> {
    if (!this.initialized || !this.redisClient) return;

    try {
      await this.redisClient.setEx(this.getKey(userId), this.TTL, JSON.stringify(status));
    } catch (error) {
      logger.error(undefined, `Error setting user cache for ${userId}:`, error);
    }
  }

  private buildStatus(user: IUser): CachedUserStatus {
    const now = new Date();

    return {
      userId: Number(user.user_id),
      isAdmin: user.is_admin || false,
      isBanned: user.is_banned || false,
      hasActiveSubscription: !!(
        user.subscription_active &&
        user.subscription_expires_at &&
        new Date(user.subscription_expires_at) > now
      ),
      subscriptionExpiresAt: user.subscription_expires_at?.toISOString() || null,
      hasActiveTrial: !!(user.trial_expires_at && new Date(user.trial_expires_at) > now),
      trialExpiresAt: user.trial_expires_at?.toISOString() || null,
      preferredLanguage: user.preferred_language || "en",
      cachedAt: new Date().toISOString(),
    };
  }
}

// Singleton instance
const userCacheService = new UserCacheService();
export default userCacheService;
