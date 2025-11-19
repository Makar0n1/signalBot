import { Context, Telegraf } from "telegraf";

import { BACK_ROUTES, CANCEL_SCENE, MAIN_ROUTES, OI_ROUTES, PUMP_ROUTES, REKT_ROUTES } from "../utils/CONST";
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

export default function handlers(bot: Telegraf<Context>) {
  // OI screener
  bot.hears(
    MAIN_ROUTES.OI,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");

      if (!user) {
        await ctx.replyWithHTML("❌ <b>Ошибка: пользователь не найден</b>");
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
        const message = wasTrialUser
          ? "⏰ <b>Ваш период триал окончен</b>\n\nПожалуйста, оплатите подписку, чтобы вновь получать сигналы."
          : "⏰ <b>Ваша подписка окончилась</b>\n\nПожалуйста, продлите подписку, чтобы продолжить получать сигналы.";

        await ctx.replyWithHTML(message, {
          reply_markup: {
            inline_keyboard: [[
              { text: "💳 Оформить подписку", callback_data: "subscribe" }
            ]]
          }
        });
        return;
      }

      const { oiKeyboard } = getOIKeyboard();
      const oiText = getMainOIText(user.config);
      await ctx.replyWithHTML(oiText, oiKeyboard);
    })
  );

  // PUMP screener
  bot.hears(
    MAIN_ROUTES.PUMP,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");

      if (!user) {
        await ctx.replyWithHTML("❌ <b>Ошибка: пользователь не найден</b>");
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
        const message = wasTrialUser
          ? "⏰ <b>Ваш период триал окончен</b>\n\nПожалуйста, оплатите подписку, чтобы вновь получать сигналы."
          : "⏰ <b>Ваша подписка окончилась</b>\n\nПожалуйста, продлите подписку, чтобы продолжить получать сигналы.";

        await ctx.replyWithHTML(message, {
          reply_markup: {
            inline_keyboard: [[
              { text: "💳 Оформить подписку", callback_data: "subscribe" }
            ]]
          }
        });
        return;
      }

      const { pumpKeyboard } = getPUMPKeyboard();
      const pumpText = getMainPumpText(user.config);

      await ctx.replyWithHTML(pumpText, pumpKeyboard);
    })
  );

  // REKT screener
  bot.hears(
    MAIN_ROUTES.REKT,
    isUser,
    asyncWrapper(async (ctx: Context, next: Function) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");

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
        const message = wasTrialUser
          ? "⏰ <b>Ваш период триал окончен</b>\n\nПожалуйста, оплатите подписку, чтобы вновь получать сигналы."
          : "⏰ <b>Ваша подписка окончилась</b>\n\nПожалуйста, продлите подписку, чтобы продолжить получать сигналы.";

        await ctx.replyWithHTML(message, {
          reply_markup: {
            inline_keyboard: [[
              { text: "💳 Оформить подписку", callback_data: "subscribe" }
            ]]
          }
        });
        return;
      }

      const { rektKeyboard } = getREKTKeyboard();
      const rektText = getMainREKTText(user.config);
      await ctx.replyWithHTML(rektText, rektKeyboard);
    })
  );

  // Exchanges
  bot.hears(
    MAIN_ROUTES.Exchange,
    isUser,
    asyncWrapper(async (ctx: Context, next: Function) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");

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
        const message = wasTrialUser
          ? "⏰ <b>Ваш период триал окончен</b>\n\nПожалуйста, оплатите подписку, чтобы вновь получать сигналы."
          : "⏰ <b>Ваша подписка окончилась</b>\n\nПожалуйста, продлите подписку, чтобы продолжить получать сигналы.";

        await ctx.replyWithHTML(message, {
          reply_markup: {
            inline_keyboard: [[
              { text: "💳 Оформить подписку", callback_data: "subscribe" }
            ]]
          }
        });
        return;
      }

      const { exchangeKeyboard } = getExchangeKeyboard(user?.config.exchange, user?.config.id);

      await ctx.replyWithHTML("Нажмите на <b>кнопку</b> биржи, чтобы поменять её статус", {
        reply_markup: exchangeKeyboard,
      });
    })
  );

  // My Subscription
  bot.hears(
    MAIN_ROUTES.Subscription,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id });

      if (!user) {
        await ctx.replyWithHTML("❌ <b>Ошибка: пользователь не найден</b>");
        return;
      }

      const now = new Date();

      // Check if user is admin
      if (user.is_admin) {
        await ctx.replyWithHTML(
          `👑 <b>Статус подписки: Администратор</b>\n\n` +
          `У вас полный неограниченный доступ ко всем функциям бота!`
        );
        return;
      }

      // Check if user has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const daysLeft = Math.ceil((user.subscription_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const canRenew = daysLeft <= 7;

        await ctx.replyWithHTML(
          `✅ <b>Подписка активна</b>\n\n` +
          `📅 Действует до: <code>${user.subscription_expires_at.toLocaleString('ru-RU')}</code>\n` +
          `⏰ Осталось дней: <b>${daysLeft}</b>\n\n` +
          `💰 Стоимость продления: <b>$10/месяц</b>` +
          (canRenew ? "\n\n💡 Вы можете продлить подписку уже сейчас!" : "\n\n💡 Продление станет доступно за 7 дней до окончания."),
          canRenew ? {
            reply_markup: {
              inline_keyboard: [[
                { text: "💳 Продлить подписку", callback_data: "subscribe" }
              ]]
            }
          } : undefined
        );
        return;
      }

      // Check if trial is active
      if (user.trial_expires_at && user.trial_expires_at > now) {
        const hoursLeft = Math.ceil((user.trial_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60));

        await ctx.replyWithHTML(
          `🎁 <b>Триал активен</b>\n\n` +
          `📅 Действует до: <code>${user.trial_expires_at.toLocaleString('ru-RU')}</code>\n` +
          `⏰ Осталось часов: <b>${hoursLeft}</b>\n\n` +
          `💡 После окончания триала вы можете оформить подписку за <b>$10/месяц</b>`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "💳 Оформить подписку", callback_data: "subscribe" }
              ]]
            }
          }
        );
        return;
      }

      // Check if subscription has expired
      if (user.subscription_expires_at && user.subscription_expires_at <= now) {
        await ctx.replyWithHTML(
          `⏰ <b>Ваша подписка окончилась</b>\n\n` +
          `📅 Окончилась: <code>${user.subscription_expires_at.toLocaleString('ru-RU')}</code>\n\n` +
          `Пожалуйста, оплатите подписку, чтобы продолжить получать сигналы.\n\n` +
          `💰 Стоимость: <b>$10/месяц</b>\n` +
          `💳 Оплата принимается в криптовалюте`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "💳 Продлить подписку", callback_data: "subscribe" }
              ]]
            }
          }
        );
        return;
      }

      // Check if trial has expired
      if (user.trial_expires_at && user.trial_expires_at <= now) {
        await ctx.replyWithHTML(
          `⏰ <b>Ваш период триал окончен</b>\n\n` +
          `📅 Окончился: <code>${user.trial_expires_at.toLocaleString('ru-RU')}</code>\n\n` +
          `Пожалуйста, оплатите подписку, чтобы вновь получать сигналы.\n\n` +
          `💰 Стоимость: <b>$10/месяц</b>\n` +
          `💳 Оплата принимается в криптовалюте`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "💳 Оформить подписку", callback_data: "subscribe" }
              ]]
            }
          }
        );
        return;
      }

      // No active subscription or trial - new user
      await ctx.replyWithHTML(
        `⏰ <b>Подписка не активна</b>\n\n` +
        `Для продолжения работы с ботом необходимо оформить подписку.\n\n` +
        `💰 Стоимость: <b>$10/месяц</b>\n` +
        `💳 Оплата принимается в криптовалюте`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "💳 Оформить подписку", callback_data: "subscribe" }
            ]]
          }
        }
      );
    })
  );

  // PUMP screener
  bot.hears(
    BACK_ROUTES.BACK,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const { mainKeyboard } = getMainKeyboard();

      await ctx.replyWithHTML("<b>Главное меню</b>", mainKeyboard);
    })
  );

  // 📈 Период роста OI
  bot.hears(
    OI_ROUTES.UP_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // 📉 Период просадки
  bot.hears(
    OI_ROUTES.DOWN_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // 🟩 Процент роста
  bot.hears(
    OI_ROUTES.UP_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // 🟥 Процент просадки
  bot.hears(
    OI_ROUTES.DOWN_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // Pump

  // 📈 Период лонг
  bot.hears(
    PUMP_ROUTES.UP_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 📉 Период шорт
  bot.hears(
    PUMP_ROUTES.DOWN_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 🟩 Процент лонг
  bot.hears(
    PUMP_ROUTES.UP_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 🟥 Процент шорт
  bot.hears(
    PUMP_ROUTES.DOWN_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 🟥 Процент шорт
  bot.hears(
    CANCEL_SCENE,
    isUser,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context) => {
      return await ctx.scene.leave();
    })
  );

  // Ликвадация настройка
  bot.hears(
    REKT_ROUTES.SET_LIMIT,
    isUser,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetREKT"))
  );
}
