import { User } from "../models";
import logger from "../utils/logger";

class SubscriptionNotifierService {
  private bot: any;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.bot = null;
  }

  /**
   * Initialize the notifier with bot instance
   */
  initialize(bot: any) {
    this.bot = bot;
    // Check every hour for expiring subscriptions
    this.intervalId = setInterval(() => this.checkExpiringSubscriptions(), 60 * 60 * 1000);
    logger.info(undefined, "Subscription notifier service initialized");
  }

  /**
   * Stop the notifier
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info(undefined, "Subscription notifier service stopped");
    }
  }

  /**
   * Check for expiring subscriptions and send notifications
   */
  async checkExpiringSubscriptions() {
    try {
      const now = new Date();

      // Find users with expiring subscriptions (7, 3, 1 days before)
      const users = await User.find({
        subscription_active: true,
        subscription_expires_at: { $exists: true },
        is_admin: false,
        is_banned: false,
      });

      for (const user of users) {
        if (!user.subscription_expires_at) continue;

        const timeLeft = user.subscription_expires_at.getTime() - now.getTime();
        const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));

        // Send notification at 7, 3, and 1 day before expiry
        if (daysLeft === 7) {
          await this.sendExpiryNotification(user.user_id as number, 7);
        } else if (daysLeft === 3) {
          await this.sendExpiryNotification(user.user_id as number, 3);
        } else if (daysLeft === 1 && hoursLeft >= 23 && hoursLeft <= 25) {
          // Send once when it's approximately 24 hours left
          await this.sendExpiryNotification(user.user_id as number, 1);
        }

        // Deactivate expired subscriptions
        if (user.subscription_expires_at <= now) {
          user.subscription_active = false;
          await user.save();
          await this.sendExpiredNotification(user.user_id as number);
          logger.info(undefined, `Subscription deactivated for user ${user.user_id}`);
        }
      }

      // Check for expired trials
      const trialUsers = await User.find({
        trial_expires_at: { $exists: true, $lte: now },
        subscription_active: false,
        is_admin: false,
        is_banned: false,
      });

      for (const user of trialUsers) {
        // Only notify once (check if trial just expired in the last hour)
        if (user.trial_expires_at) {
          const timeSinceExpiry = now.getTime() - user.trial_expires_at.getTime();
          const hoursSinceExpiry = timeSinceExpiry / (1000 * 60 * 60);

          if (hoursSinceExpiry < 1) {
            await this.sendTrialExpiredNotification(user.user_id as number);
          }
        }
      }

      logger.debug(undefined, `Checked ${users.length} subscriptions and ${trialUsers.length} trials`);
    } catch (error) {
      logger.error(undefined, "Error checking expiring subscriptions", error);
    }
  }

  /**
   * Send notification about expiring subscription
   */
  private async sendExpiryNotification(userId: number, daysLeft: number) {
    if (!this.bot) return;

    try {
      let message = "";
      let emoji = "";

      if (daysLeft === 7) {
        emoji = "⚠️";
        message =
          `${emoji} <b>Напоминание о подписке</b>\n\n` +
          `Ваша подписка истечёт через <b>7 дней</b>!\n\n` +
          `💡 Рекомендуем продлить подписку заранее, чтобы не прерывать получение сигналов.\n\n` +
          `💰 Стоимость продления: <b>$10/месяц</b>`;
      } else if (daysLeft === 3) {
        emoji = "⏰";
        message =
          `${emoji} <b>Важное напоминание!</b>\n\n` +
          `Ваша подписка истечёт через <b>3 дня</b>!\n\n` +
          `Не упустите важные сигналы — продлите подписку прямо сейчас.\n\n` +
          `💰 Стоимость: <b>$10/месяц</b>`;
      } else if (daysLeft === 1) {
        emoji = "🚨";
        message =
          `${emoji} <b>Срочное уведомление!</b>\n\n` +
          `Ваша подписка истекает <b>ЗАВТРА</b>!\n\n` +
          `Продлите подписку сегодня, чтобы завтра продолжать получать сигналы без перерыва.\n\n` +
          `💰 Стоимость: <b>$10/месяц</b>`;
      }

      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "💳 Продлить подписку", callback_data: "subscribe" }]],
        },
      });

      logger.info(undefined, `Expiry notification sent to user ${userId} (${daysLeft} days left)`);
    } catch (error: any) {
      logger.error(undefined, `Error sending expiry notification to user ${userId}`, error.message);
    }
  }

  /**
   * Send notification about expired subscription
   */
  private async sendExpiredNotification(userId: number) {
    if (!this.bot) return;

    try {
      const message =
        `❌ <b>Подписка истекла</b>\n\n` +
        `Ваша подписка закончилась, и вы больше не будете получать сигналы от бота.\n\n` +
        `Чтобы продолжить пользоваться сервисом, оформите новую подписку.\n\n` +
        `💰 Стоимость: <b>$10/месяц</b>`;

      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "💳 Оформить подписку", callback_data: "subscribe" }]],
        },
      });

      logger.info(undefined, `Expired notification sent to user ${userId}`);
    } catch (error: any) {
      logger.error(undefined, `Error sending expired notification to user ${userId}`, error.message);
    }
  }

  /**
   * Send notification about expired trial
   */
  private async sendTrialExpiredNotification(userId: number) {
    if (!this.bot) return;

    try {
      const message =
        `⏰ <b>Триал период истёк</b>\n\n` +
        `Ваш бесплатный 24-часовой доступ закончился.\n\n` +
        `Спасибо, что попробовали наш сервис! Надеемся, он вам понравился.\n\n` +
        `💡 Чтобы продолжить получать сигналы, оформите подписку всего за <b>$10/месяц</b>.`;

      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "💳 Оформить подписку", callback_data: "subscribe" }]],
        },
      });

      logger.info(undefined, `Trial expired notification sent to user ${userId}`);
    } catch (error: any) {
      logger.error(undefined, `Error sending trial expired notification to user ${userId}`, error.message);
    }
  }

  /**
   * Manual check trigger (for testing)
   */
  async triggerCheck() {
    logger.info(undefined, "Manual subscription check triggered");
    await this.checkExpiringSubscriptions();
  }
}

export default new SubscriptionNotifierService();
