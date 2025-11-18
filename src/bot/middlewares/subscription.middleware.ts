import { Context } from "telegraf";
import { User } from "../models";
import logger from "../utils/logger";

/**
 * Middleware to initialize trial period for new users
 */
export const initializeTrial = async (ctx: Context, next: () => Promise<void>) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const user = await User.findOne({ user_id: userId });

    // Skip trial for admins
    if (user && user.is_admin) {
      return next();
    }

    if (user && !user.trial_started_at && !user.subscription_active && !user.is_admin) {
      // Start 24-hour trial
      const now = new Date();
      const trialExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      user.trial_started_at = now;
      user.trial_expires_at = trialExpiry;
      await user.save();

      logger.info(undefined, `Trial period started for user ${userId}, expires at ${trialExpiry}`);
    }

    return next();
  } catch (error) {
    logger.error(undefined, "Error in initializeTrial middleware", error);
    return next();
  }
};

/**
 * Middleware to check if user has active subscription or trial
 */
export const checkSubscription = async (ctx: Context, next: () => Promise<void>) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.replyWithHTML("❌ <b>Ошибка авторизации</b>");
      return;
    }

    const user = await User.findOne({ user_id: userId });

    if (!user) {
      await ctx.replyWithHTML("❌ <b>Пользователь не найден</b>");
      return;
    }

    // Admins always have access
    if (user.is_admin) {
      return next();
    }

    // Check if user is banned
    if (user.is_banned) {
      await ctx.replyWithHTML(
        `🚫 <b>Доступ заблокирован</b>\n\n` +
        `Ваш аккаунт был заблокирован администратором.\n` +
        `Для уточнения деталей свяжитесь с поддержкой.`
      );
      return;
    }

    const now = new Date();

    // Check if user has active subscription
    if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
      return next();
    }

    // Check if trial is still active
    if (user.trial_expires_at && user.trial_expires_at > now) {
      return next();
    }

    // Trial expired or no subscription
    await ctx.replyWithHTML(
      `⏰ <b>Триал период истёк!</b>\n\n` +
      `Для продолжения работы с ботом необходимо оформить подписку.\n\n` +
      `💰 Стоимость: <b>10$ в месяц</b>\n` +
      `💳 Оплата принимается в криптовалюте`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "💳 Оплатить подписку", callback_data: "subscribe" }
          ]]
        }
      }
    );
  } catch (error) {
    logger.error(undefined, "Error in checkSubscription middleware", error);
    await ctx.replyWithHTML("❌ <b>Произошла ошибка. Попробуйте позже.</b>");
  }
};

/**
 * Helper function to check if user has access (for use in services)
 */
export const hasAccess = async (userId: number): Promise<boolean> => {
  try {
    const user = await User.findOne({ user_id: userId });

    if (!user || user.is_banned) return false;

    // Admins always have access
    if (user.is_admin) return true;

    const now = new Date();

    // Check active subscription
    if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
      return true;
    }

    // Check trial
    if (user.trial_expires_at && user.trial_expires_at > now) {
      return true;
    }

    return false;
  } catch (error) {
    logger.error(undefined, "Error checking user access", error);
    return false;
  }
};
