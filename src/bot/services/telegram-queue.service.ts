import { Telegraf, Context } from "telegraf";
import logger from "../utils/logger";
import UserService from "./user.service";
import { User } from "../models";
import signalCleanupService from "./signal-cleanup.service";

interface QueuedMessage {
  userId: string;
  message: string;
  options: any;
  priority: "high" | "normal";
  retries: number;
  createdAt: Date;
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
}

/**
 * TelegramQueueService - асинхронная очередь для отправки сообщений в Telegram
 *
 * Решает проблемы:
 * 1. Rate limiting Telegram API (~30 сообщений/сек)
 * 2. Блокирующие await при отправке сообщений
 * 3. Потеря сигналов при ошибках
 *
 * Особенности:
 * - Приоритетные очереди (REKT > PUMP/OI)
 * - Retry с exponential backoff при ошибках
 * - Автоматическое удаление заблокировавших бота пользователей
 */
class TelegramQueueService {
  private bot: Telegraf<Context> | null = null;
  private highPriorityQueue: QueuedMessage[] = [];
  private normalQueue: QueuedMessage[] = [];
  private isProcessing = false;
  private consecutiveErrors = 0;
  private rateLimitedUntil: Date | null = null;

  // Конфигурация
  private readonly MAX_MESSAGES_PER_SECOND = 25; // Telegram limit ~30, оставляем запас
  private readonly BATCH_INTERVAL_MS = 1000 / this.MAX_MESSAGES_PER_SECOND; // ~40ms между сообщениями
  private readonly MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY_MS = 1000;

  /**
   * Инициализация сервиса с экземпляром бота
   */
  initialize(bot: Telegraf<Context>): void {
    this.bot = bot;
    this.startProcessing();
    logger.info(undefined, "TelegramQueueService initialized");
  }

  /**
   * Добавить сообщение в очередь
   */
  async send(
    userId: string,
    message: string,
    options: any = {},
    priority: "high" | "normal" = "normal"
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const queuedMessage: QueuedMessage = {
        userId,
        message,
        options: {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          ...options,
        },
        priority,
        retries: 0,
        createdAt: new Date(),
        resolve,
        reject,
      };

      if (priority === "high") {
        this.highPriorityQueue.push(queuedMessage);
      } else {
        this.normalQueue.push(queuedMessage);
      }

      // Запустить обработку если не активна
      if (!this.isProcessing) {
        this.startProcessing();
      }
    });
  }

  /**
   * Отправить сообщение с высоким приоритетом (для REKT сигналов)
   */
  async sendHighPriority(userId: string, message: string, options: any = {}): Promise<boolean> {
    return this.send(userId, message, options, "high");
  }

  /**
   * Запустить фоновую обработку очереди
   */
  private startProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processQueue();
  }

  /**
   * Основной цикл обработки очереди
   */
  private async processQueue(): Promise<void> {
    while (this.highPriorityQueue.length > 0 || this.normalQueue.length > 0) {
      // Проверить rate limit
      if (this.rateLimitedUntil && new Date() < this.rateLimitedUntil) {
        const waitTime = this.rateLimitedUntil.getTime() - Date.now();
        logger.warn(undefined, `Rate limited, waiting ${waitTime}ms`);
        await this.delay(waitTime);
        this.rateLimitedUntil = null;
      }

      // Взять сообщение из очереди (приоритет high > normal)
      const message = this.highPriorityQueue.shift() || this.normalQueue.shift();
      if (!message) break;

      try {
        await this.sendMessage(message);
        this.consecutiveErrors = 0;
      } catch (error: any) {
        await this.handleError(error, message);
      }

      // Задержка между сообщениями для соблюдения rate limit
      await this.delay(this.BATCH_INTERVAL_MS);
    }

    this.isProcessing = false;
  }

  /**
   * Отправить одно сообщение
   */
  private async sendMessage(msg: QueuedMessage): Promise<void> {
    if (!this.bot) {
      throw new Error("Bot not initialized");
    }

    // Check if user is in settings mode - skip signal if so
    const user = await User.findOne({ user_id: Number(msg.userId) });
    if (user?.in_settings_mode) {
      logger.debug(undefined, `User ${msg.userId} is in settings mode, skipping signal`);
      msg.resolve(false);
      return;
    }

    const sentMessage = await this.bot.telegram.sendMessage(msg.userId, msg.message, msg.options);
    msg.resolve(true);

    // Track signal for auto-deletion after 24 hours
    await signalCleanupService.trackSignal(
      Number(msg.userId),
      sentMessage.chat.id,
      sentMessage.message_id
    );

    logger.debug(undefined, `Message sent to user ${msg.userId}, queue sizes: high=${this.highPriorityQueue.length}, normal=${this.normalQueue.length}`);
  }

  /**
   * Обработка ошибок отправки
   */
  private async handleError(error: any, message: QueuedMessage): Promise<void> {
    const errorCode = error.response?.error_code;

    // 403 - пользователь заблокировал бота
    if (errorCode === 403) {
      logger.debug(undefined, `User ${message.userId} blocked the bot, removing user`);
      await UserService.findAndDeleteUser(Number(message.userId));
      message.resolve(false);
      return;
    }

    // 429 - rate limit
    if (errorCode === 429) {
      const retryAfter = error.response?.parameters?.retry_after || 5;
      this.rateLimitedUntil = new Date(Date.now() + retryAfter * 1000);
      logger.warn(undefined, `Rate limited by Telegram, retry after ${retryAfter}s`);

      // Вернуть сообщение в очередь
      if (message.priority === "high") {
        this.highPriorityQueue.unshift(message);
      } else {
        this.normalQueue.unshift(message);
      }
      return;
    }

    // 400 - плохой запрос (невалидный chat_id и т.д.)
    if (errorCode === 400) {
      logger.warn(undefined, `Bad request for user ${message.userId}: ${error.message}`);
      message.resolve(false);
      return;
    }

    // Другие ошибки - retry с exponential backoff
    this.consecutiveErrors++;
    message.retries++;

    if (message.retries < this.MAX_RETRIES) {
      const retryDelay = this.BASE_RETRY_DELAY_MS * Math.pow(2, message.retries - 1);
      logger.warn(undefined, `Retrying message to ${message.userId} in ${retryDelay}ms (attempt ${message.retries}/${this.MAX_RETRIES})`);

      await this.delay(retryDelay);

      // Вернуть в очередь для retry
      if (message.priority === "high") {
        this.highPriorityQueue.unshift(message);
      } else {
        this.normalQueue.unshift(message);
      }
    } else {
      logger.error(undefined, `Failed to send message to ${message.userId} after ${this.MAX_RETRIES} retries: ${error.message}`);
      message.reject(error);
    }
  }

  /**
   * Получить статистику очереди
   */
  getStats(): {
    highQueueSize: number;
    normalQueueSize: number;
    isProcessing: boolean;
    consecutiveErrors: number;
  } {
    return {
      highQueueSize: this.highPriorityQueue.length,
      normalQueueSize: this.normalQueue.length,
      isProcessing: this.isProcessing,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  /**
   * Очистить очереди (для graceful shutdown)
   */
  clear(): void {
    this.highPriorityQueue = [];
    this.normalQueue = [];
    this.isProcessing = false;
    logger.info(undefined, "TelegramQueueService cleared");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
const telegramQueueService = new TelegramQueueService();
export default telegramQueueService;
