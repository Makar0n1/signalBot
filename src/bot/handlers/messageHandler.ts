import { Context, Telegraf } from "telegraf";

import asyncWrapper from "../utils/error-handler";
import getMainKeyboard from "../keyboards/main.keyboard";
import getOIKeyboard from "../keyboards/OI.keyboard";
import getPUMPKeyboard from "../keyboards/PUMP.keyboard";
import getREKTKeyboard from "../keyboards/REKT.keyboard";
import { User } from "../models";
import { deleteMessageNext } from "../middlewares/deleteMessages.middleware";
import { getMainOIText, getMainPumpText, getMainREKTText } from "../utils/texts";
import { isUser } from "../middlewares";
import getExchangeKeyboard from "../keyboards/Exchange.keyboard";
import { getUserLanguage, t, tc } from "../utils/i18n";

// Regex patterns for matching keyboard buttons in both languages
const OI_PATTERN = /^💼 OI Screener$/;
const PUMP_PATTERN = /^📈 Pump Screener$/;
const REKT_PATTERN = /^💣 REKT Screener$/;
const EXCHANGE_PATTERN = /^💹 (Выбор биржи|Exchange)$/;
const SUBSCRIPTION_PATTERN = /^📱 (Моя подписка|My Subscription)$/;
const BACK_PATTERN = /^⬅️ (Назад|Back)$/;

// OI keyboard patterns
const OI_UP_PERIOD_PATTERN = /^📈 (Период роста|Growth Period)$/;
const OI_DOWN_PERIOD_PATTERN = /^📉 (Период просадки|Decline Period)$/;
const OI_UP_PERCENT_PATTERN = /^🟩 (Процент роста|Growth %)$/;
const OI_DOWN_PERCENT_PATTERN = /^🟥 (Процент просадки|Decline %)$/;

// PUMP keyboard patterns
const PUMP_UP_PERIOD_PATTERN = /^📈 (Период лонг|Long Period)$/;
const PUMP_DOWN_PERIOD_PATTERN = /^📉 (Период шорт|Short Period)$/;
const PUMP_UP_PERCENT_PATTERN = /^🟩 (Процент лонг|Long %)$/;
const PUMP_DOWN_PERCENT_PATTERN = /^🟥 (Процент шорт|Short %)$/;

// REKT keyboard patterns
const REKT_SET_LIMIT_PATTERN = /^🔻 (Установить минимальную ликвидацию|Set Minimum Liquidation)$/;

// Cancel pattern
const CANCEL_PATTERN = /^❌ (Отменить|Cancel)$/;

// Helper function to show no access message
async function showNoAccessMessage(ctx: Context, wasTrialUser: boolean) {
  const lang = getUserLanguage(ctx);
  const message = wasTrialUser
    ? `${t("subscription.trial_expired", lang)}\n\n${t("subscription.please_subscribe_trial", lang)}`
    : `${t("subscription.expired", lang)}\n\n${t("subscription.please_renew", lang)}`;

  await ctx.replyWithHTML(message, {
    reply_markup: {
      inline_keyboard: [[
        { text: t("subscription.btn_subscribe", lang), callback_data: "subscribe" }
      ]]
    }
  });
}

export default function handlers(bot: Telegraf<Context>) {
  // OI screener
  bot.hears(
    OI_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      const lang = getUserLanguage(ctx);

      if (!user) {
        await ctx.replyWithHTML(tc(ctx, "error.user_not_found"));
        return;
      }

      // Check subscription access
      const now = new Date();
      const hasActiveSubscription = user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now;
      const hasActiveTrial = user.trial_expires_at && user.trial_expires_at > now;
      const isAdmin = user.is_admin;

      // If no access, show subscription message
      if (!isAdmin && !hasActiveSubscription && !hasActiveTrial) {
        const wasTrialUser = user.trial_started_at !== null && user.trial_started_at !== undefined;
        await showNoAccessMessage(ctx, wasTrialUser);
        return;
      }

      const { oiKeyboard } = getOIKeyboard(lang);
      const oiText = getMainOIText(user.config);
      await ctx.replyWithHTML(oiText, oiKeyboard);
    })
  );

  // PUMP screener
  bot.hears(
    PUMP_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      const lang = getUserLanguage(ctx);

      if (!user) {
        await ctx.replyWithHTML(tc(ctx, "error.user_not_found"));
        return;
      }

      // Check subscription access
      const now = new Date();
      const hasActiveSubscription = user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now;
      const hasActiveTrial = user.trial_expires_at && user.trial_expires_at > now;
      const isAdmin = user.is_admin;

      // If no access, show subscription message
      if (!isAdmin && !hasActiveSubscription && !hasActiveTrial) {
        const wasTrialUser = user.trial_started_at !== null && user.trial_started_at !== undefined;
        await showNoAccessMessage(ctx, wasTrialUser);
        return;
      }

      const { pumpKeyboard } = getPUMPKeyboard(lang);
      const pumpText = getMainPumpText(user.config);

      await ctx.replyWithHTML(pumpText, pumpKeyboard);
    })
  );

  // REKT screener
  bot.hears(
    REKT_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context, next: Function) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      const lang = getUserLanguage(ctx);

      if (!user?.config) {
        return next();
      }

      // Check subscription access
      const now = new Date();
      const hasActiveSubscription = user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now;
      const hasActiveTrial = user.trial_expires_at && user.trial_expires_at > now;
      const isAdmin = user.is_admin;

      // If no access, show subscription message
      if (!isAdmin && !hasActiveSubscription && !hasActiveTrial) {
        const wasTrialUser = user.trial_started_at !== null && user.trial_started_at !== undefined;
        await showNoAccessMessage(ctx, wasTrialUser);
        return;
      }

      const { rektKeyboard } = getREKTKeyboard(lang);
      const rektText = getMainREKTText(user.config);
      await ctx.replyWithHTML(rektText, rektKeyboard);
    })
  );

  // Exchanges
  bot.hears(
    EXCHANGE_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context, next: Function) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      const lang = getUserLanguage(ctx);

      if (!user?.config) {
        return next();
      }

      // Check subscription access
      const now = new Date();
      const hasActiveSubscription = user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now;
      const hasActiveTrial = user.trial_expires_at && user.trial_expires_at > now;
      const isAdmin = user.is_admin;

      // If no access, show subscription message
      if (!isAdmin && !hasActiveSubscription && !hasActiveTrial) {
        const wasTrialUser = user.trial_started_at !== null && user.trial_started_at !== undefined;
        await showNoAccessMessage(ctx, wasTrialUser);
        return;
      }

      const { exchangeKeyboard } = getExchangeKeyboard(user?.config.exchange, user?.config.id);

      await ctx.replyWithHTML(t("exchange.toggle_status", lang), {
        reply_markup: exchangeKeyboard,
      });
    })
  );

  // My Subscription
  bot.hears(
    SUBSCRIPTION_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id });
      const lang = getUserLanguage(ctx);
      const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";

      if (!user) {
        await ctx.replyWithHTML(tc(ctx, "error.user_not_found"));
        return;
      }

      const now = new Date();

      // Check if user is admin
      if (user.is_admin) {
        await ctx.replyWithHTML(
          t("subscription.admin_status", lang),
          {
            reply_markup: {
              inline_keyboard: [[
                { text: t("btn.language", lang), callback_data: "select_language" }
              ]]
            }
          }
        );
        return;
      }

      // Check if user has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const daysLeft = Math.ceil((user.subscription_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const canRenew = daysLeft <= 7;

        const message = `${t("subscription.active", lang)}\n\n` +
          `${t("subscription.valid_until", lang)} <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n` +
          `${t("subscription.days_left", lang)} <b>${daysLeft}</b>\n\n` +
          `${t("subscription.renewal_price", lang)} <b>$${price}/${lang === 'ru' ? 'месяц' : 'month'}</b>` +
          (canRenew ? `\n\n${t("subscription.renew_now", lang)}` : `\n\n${t("subscription.renew_available_in_7_days", lang)}`);

        const buttons = canRenew
          ? [[{ text: t("subscription.btn_renew", lang), callback_data: "subscribe" }], [{ text: t("btn.language", lang), callback_data: "select_language" }]]
          : [[{ text: t("btn.language", lang), callback_data: "select_language" }]];

        await ctx.replyWithHTML(message, {
          reply_markup: { inline_keyboard: buttons }
        });
        return;
      }

      // Check if trial is active
      if (user.trial_expires_at && user.trial_expires_at > now) {
        const hoursLeft = Math.ceil((user.trial_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60));

        await ctx.replyWithHTML(
          `${t("subscription.trial_active", lang)}\n\n` +
          `${t("subscription.valid_until", lang)} <code>${user.trial_expires_at.toLocaleString(locale)}</code>\n` +
          `${t("subscription.hours_left", lang)} <b>${hoursLeft}</b>\n\n` +
          `${t("subscription.trial_tip", lang)} <b>$${price}/${lang === 'ru' ? 'месяц' : 'month'}</b>`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: t("subscription.btn_subscribe", lang), callback_data: "subscribe" }],
                [{ text: t("btn.language", lang), callback_data: "select_language" }]
              ]
            }
          }
        );
        return;
      }

      // Check if subscription has expired
      if (user.subscription_expires_at && user.subscription_expires_at <= now) {
        await ctx.replyWithHTML(
          `${t("subscription.expired", lang)}\n\n` +
          `${t("subscription.expired_at", lang)} <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n\n` +
          `${t("subscription.please_renew", lang)}\n\n` +
          `${t("subscription.price", lang)} <b>$${price}/${lang === 'ru' ? 'месяц' : 'month'}</b>\n` +
          `${t("subscription.crypto_payment", lang)}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: t("subscription.btn_renew", lang), callback_data: "subscribe" }],
                [{ text: t("btn.language", lang), callback_data: "select_language" }]
              ]
            }
          }
        );
        return;
      }

      // Check if trial has expired
      if (user.trial_expires_at && user.trial_expires_at <= now) {
        await ctx.replyWithHTML(
          `${t("subscription.trial_expired", lang)}\n\n` +
          `${t("subscription.trial_ended_at", lang)} <code>${user.trial_expires_at.toLocaleString(locale)}</code>\n\n` +
          `${t("subscription.please_subscribe_trial", lang)}\n\n` +
          `${t("subscription.price", lang)} <b>$${price}/${lang === 'ru' ? 'месяц' : 'month'}</b>\n` +
          `${t("subscription.crypto_payment", lang)}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: t("subscription.btn_subscribe", lang), callback_data: "subscribe" }],
                [{ text: t("btn.language", lang), callback_data: "select_language" }]
              ]
            }
          }
        );
        return;
      }

      // No active subscription or trial - new user
      await ctx.replyWithHTML(
        `${t("subscription.inactive", lang)}\n\n` +
        `${t("subscription.need_subscribe", lang)}\n\n` +
        `${t("subscription.price", lang)} <b>$${price}/${lang === 'ru' ? 'месяц' : 'month'}</b>\n` +
        `${t("subscription.crypto_payment", lang)}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: t("subscription.btn_subscribe", lang), callback_data: "subscribe" }],
              [{ text: t("btn.language", lang), callback_data: "select_language" }]
            ]
          }
        }
      );
    })
  );

  // Back button
  bot.hears(
    BACK_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const lang = getUserLanguage(ctx);
      const { mainKeyboard } = getMainKeyboard(lang);

      await ctx.replyWithHTML(t("menu.title", lang), mainKeyboard);
    })
  );

  // OI settings handlers
  bot.hears(
    OI_UP_PERIOD_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  bot.hears(
    OI_DOWN_PERIOD_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  bot.hears(
    OI_UP_PERCENT_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  bot.hears(
    OI_DOWN_PERCENT_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // PUMP settings handlers
  bot.hears(
    PUMP_UP_PERIOD_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  bot.hears(
    PUMP_DOWN_PERIOD_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  bot.hears(
    PUMP_UP_PERCENT_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  bot.hears(
    PUMP_DOWN_PERCENT_PATTERN,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // Cancel button
  bot.hears(
    CANCEL_PATTERN,
    isUser,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context) => {
      return await ctx.scene.leave();
    })
  );

  // REKT settings
  bot.hears(
    REKT_SET_LIMIT_PATTERN,
    isUser,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetREKT"))
  );
}
