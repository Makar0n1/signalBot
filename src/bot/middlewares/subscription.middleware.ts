import { Context, Markup } from "telegraf";
import { User } from "../models";
import logger from "../utils/logger";
import { tc } from "../utils/i18n";

/**
 * Middleware to initialize trial period for new users
 * NOTE: Trial is now activated manually via "start_trial" button
 * This middleware is kept for backward compatibility but doesn't auto-activate trial
 */
export const initializeTrial = async (ctx: Context, next: () => Promise<void>) => {
  try {
    // Trial activation moved to subscriptionHandler (start_trial button)
    // This middleware now just passes through
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

    // Trial expired or no subscription - Remove keyboard and show subscription message
    await ctx.reply(
      tc(ctx, "trial.expired"),
      {
        parse_mode: "HTML",
        reply_markup: Markup.removeKeyboard().reply_markup
      }
    );

    // Send inline keyboard in a separate message
    await ctx.replyWithHTML(
      tc(ctx, "trial.expired"),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }
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
