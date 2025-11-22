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
    // Check every minute for expired subscriptions/trials
    this.intervalId = setInterval(() => this.checkExpiringSubscriptions(), 60 * 1000);
    // Run initial check
    this.checkExpiringSubscriptions();
    logger.info(undefined, "Subscription notifier service initialized (checking every minute)");
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

      // Find users with expired trials that haven't been notified
      const expiredTrialUsers = await User.find({
        trial_expires_at: { $exists: true, $lte: now },
        trial_expiry_notified: { $ne: true },
        subscription_active: false,
        is_admin: false,
        is_banned: false,
      });

      for (const user of expiredTrialUsers) {
        await this.sendTrialExpiredNotification(user.user_id as number, user.trial_expires_at!);
        // Mark as notified
        user.trial_expiry_notified = true;
        await user.save();
        logger.info(undefined, `Trial expired notification sent to user ${user.user_id}`);
      }

      // Find users with expired subscriptions that haven't been notified
      const expiredSubscriptionUsers = await User.find({
        subscription_expires_at: { $exists: true, $lte: now },
        subscription_expiry_notified: { $ne: true },
        is_admin: false,
        is_banned: false,
      });

      for (const user of expiredSubscriptionUsers) {
        // Deactivate subscription
        user.subscription_active = false;
        await this.sendExpiredNotification(user.user_id as number, user.subscription_expires_at!);
        // Mark as notified
        user.subscription_expiry_notified = true;
        await user.save();
        logger.info(undefined, `Subscription expired notification sent and deactivated for user ${user.user_id}`);
      }

      if (expiredTrialUsers.length > 0 || expiredSubscriptionUsers.length > 0) {
        logger.info(undefined, `Processed ${expiredTrialUsers.length} expired trials and ${expiredSubscriptionUsers.length} expired subscriptions`);
      }
    } catch (error) {
      logger.error(undefined, "Error checking expiring subscriptions", error);
    }
  }

  /**
   * Send notification about expired subscription
   */
  private async sendExpiredNotification(userId: number, expiredAt: Date) {
    if (!this.bot) return;

    try {
      const user = await User.findOne({ user_id: userId });
      const lang = user?.preferred_language || 'en';
      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";

      const message = lang === 'ru'
        ? `⏰ <b>Ваша подписка окончилась</b>\n\n` +
          `📅 Окончилась: <code>${expiredAt.toLocaleString('ru-RU')}</code>\n\n` +
          `Пожалуйста, оплатите подписку, чтобы продолжить получать сигналы.\n\n` +
          `💰 Стоимость: <b>$${price}/месяц</b>\n` +
          `💳 Оплата принимается в криптовалюте`
        : `⏰ <b>Your subscription has expired</b>\n\n` +
          `📅 Expired: <code>${expiredAt.toLocaleString('en-US')}</code>\n\n` +
          `Please renew your subscription to continue receiving signals.\n\n` +
          `💰 Price: <b>$${price}/month</b>\n` +
          `💳 Cryptocurrency payment accepted`;

      const sentMessage = await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: lang === 'ru' ? '💳 Продлить подписку' : '💳 Renew Subscription', callback_data: "subscribe" }
          ]],
        },
      });

      // Pin the expiry message
      try {
        await this.bot.telegram.pinChatMessage(userId, sentMessage.message_id, { disable_notification: true });
        // Save pinned message ID for later unpinning
        await User.updateOne({ user_id: userId }, { pinned_expiry_message_id: sentMessage.message_id });
      } catch (pinError) {
        logger.warn(undefined, `Could not pin expiry message for user ${userId}`);
      }

      logger.info(undefined, `Subscription expired notification sent to user ${userId}`);
    } catch (error: any) {
      logger.error(undefined, `Error sending expired notification to user ${userId}`, error.message);
    }
  }

  /**
   * Send notification about expired trial
   */
  private async sendTrialExpiredNotification(userId: number, expiredAt: Date) {
    if (!this.bot) return;

    try {
      const user = await User.findOne({ user_id: userId });
      const lang = user?.preferred_language || 'en';
      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";

      const message = lang === 'ru'
        ? `⏰ <b>Ваш триал период окончен</b>\n\n` +
          `📅 Окончился: <code>${expiredAt.toLocaleString('ru-RU')}</code>\n\n` +
          `Пожалуйста, оформите подписку, чтобы продолжить получать сигналы.\n\n` +
          `💰 Стоимость: <b>$${price}/месяц</b>\n` +
          `💳 Оплата принимается в криптовалюте`
        : `⏰ <b>Your trial period has ended</b>\n\n` +
          `📅 Ended: <code>${expiredAt.toLocaleString('en-US')}</code>\n\n` +
          `Please purchase a subscription to continue receiving signals.\n\n` +
          `💰 Price: <b>$${price}/month</b>\n` +
          `💳 Cryptocurrency payment accepted`;

      const sentMessage = await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: lang === 'ru' ? '💳 Оформить подписку' : '💳 Subscribe', callback_data: "subscribe" }
          ]],
        },
      });

      // Pin the expiry message
      try {
        await this.bot.telegram.pinChatMessage(userId, sentMessage.message_id, { disable_notification: true });
        // Save pinned message ID for later unpinning
        await User.updateOne({ user_id: userId }, { pinned_expiry_message_id: sentMessage.message_id });
      } catch (pinError) {
        logger.warn(undefined, `Could not pin trial expiry message for user ${userId}`);
      }

      logger.info(undefined, `Trial expired notification sent to user ${userId}`);
    } catch (error: any) {
      logger.error(undefined, `Error sending trial expired notification to user ${userId}`, error.message);
    }
  }

  /**
   * Unpin and delete expiry message after subscription renewal
   */
  async unpinExpiryMessage(userId: number) {
    if (!this.bot) return;

    try {
      const user = await User.findOne({ user_id: userId });
      if (user?.pinned_expiry_message_id) {
        try {
          await this.bot.telegram.unpinChatMessage(userId, { message_id: user.pinned_expiry_message_id });
          await this.bot.telegram.deleteMessage(userId, user.pinned_expiry_message_id);
        } catch (e) {
          // Message might already be deleted
        }
        await User.updateOne({ user_id: userId }, { $unset: { pinned_expiry_message_id: 1 } });
        logger.info(undefined, `Expiry message unpinned and deleted for user ${userId}`);
      }
    } catch (error: any) {
      logger.error(undefined, `Error unpinning expiry message for user ${userId}`, error.message);
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
