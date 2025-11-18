import dotenv from "dotenv";
dotenv.config();
import { Context, Telegraf } from "telegraf";

import asyncWrapper from "../utils/error-handler";
import getMainKeyboard from "../keyboards/main.keyboard";
import guestService from "../services/guest.service";
import { Admin } from "../models";
import userService from "../services/user.service";
import { createOrUpdateMainAdmin } from "..";

export default function handlers(bot: Telegraf<Context>) {
  bot.command(
    "start",
    asyncWrapper(async (ctx: Context) => {
      const { User } = await import("../models/index.js");

      const data = {
        user_id: ctx.message?.from.id,
        language_code: ctx.message?.from.language_code,
        username: ctx.message?.from.username,
      };

      // Create or update main admin
      if (data.user_id === Number(process.env.MAIN_ADMIN_TG_USER_ID)) {
        await createOrUpdateMainAdmin(String(data.user_id), true);
      }

      // Create guest
      await guestService.createGuest(data);

      // Find user
      const user = await User.findOne({ user_id: data.user_id });

      if (!user) {
        await ctx.replyWithHTML("❌ <b>Ошибка при создании пользователя</b>");
        return;
      }

      const now = new Date();

      // Check if user is admin
      if (user.is_admin) {
        const { mainKeyboard } = getMainKeyboard();
        await ctx.replyWithHTML(
          `<b>👋 Привет, Админ!</b>\n\nЯ - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас, когда произойдут важные события, такие как изменение <b>открытого интереса</b>, <b>памп 📈</b> или <b>ликвидация 💥</b> всех криптовалютных пар! 💹\n\n<b>Главное меню ⬇️</b>`,
          mainKeyboard
        );
        return;
      }

      // Check if user has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard();
        await ctx.replyWithHTML(
          `<b>👋 С возвращением!</b>\n\nЯ - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас, когда произойдут важные события, такие как изменение <b>открытого интереса</b>, <b>памп 📈</b> или <b>ликвидация 💥</b> всех криптовалютных пар! 💹\n\n<b>Главное меню ⬇️</b>`,
          mainKeyboard
        );
        return;
      }

      // Check if trial is active
      if (user.trial_expires_at && user.trial_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard();
        const hoursLeft = Math.ceil((user.trial_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60));
        await ctx.replyWithHTML(
          `<b>👋 Добро пожаловать!</b>\n\nЯ - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас, когда произойдут важные события, такие как изменение <b>открытого интереса</b>, <b>памп 📈</b> или <b>ликвидация 💥</b> всех криптовалютных пар! 💹\n\n✨ <b>У вас активен триал на ${hoursLeft} часов</b>\n\n<b>Главное меню ⬇️</b>`,
          mainKeyboard
        );
        return;
      }

      // New user or trial expired - show welcome message with subscription options
      await ctx.replyWithHTML(
        `<b>👋 Привет!</b>\n\n` +
        `Я - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас о важных событиях!\n\n` +
        `📊 <b>Что я умею:</b>\n` +
        `• Отслеживать изменения <b>открытого интереса (OI)</b>\n` +
        `• Уведомлять о <b>пампах и дампах 📈📉</b>\n` +
        `• Сигнализировать о крупных <b>ликвидациях 💥</b>\n\n` +
        `🎁 <b>Специальное предложение:</b>\n` +
        `При нажатии кнопки <b>"Начать"</b> вы получите <b>БЕСПЛАТНЫЙ 24-часовой доступ</b> ко всем функциям бота!\n\n` +
        `💰 После триала: <b>$10/месяц</b>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 Начать", callback_data: "start_trial" }],
              [{ text: "💳 Купить подписку", callback_data: "subscribe" }],
              [{ text: "❓ Почему платно?", callback_data: "why_paid" }]
            ]
          }
        }
      );
    })
  );

  bot.command(
    "addUser",
    asyncWrapper(async (ctx: Context, next: Function) => {
      const admin = await Admin.findOne({ user_id: ctx.message?.from.id });
      if (!ctx.text || !admin) {
        return await next();
      }
      const args = ctx.text.split(" ");
      if (args && args.length === 2) {
        const userId = args[1];
        const isNumeric = /^\d+$/.test(userId);

        if (!isNumeric) {
          await ctx.replyWithHTML(`User_id должен иметь формат числа!`);
          return await next();
        }

        await userService.createUser({ user_id: Number(userId) });

        await ctx.replyWithHTML(`Создана запись в User c user_id: <b>${userId}</b>`);
      } else {
        await ctx.replyWithHTML(`Пожалуйста, используйте команду в формате: /addUser <user_id>`);
      }
    })
  );

  bot.command(
    "deleteUser",
    asyncWrapper(async (ctx: Context, next: Function) => {
      const admin = await Admin.findOne({ user_id: ctx.message?.from.id });
      if (!ctx.text || !admin) {
        return await next();
      }
      const args = ctx.text.split(" ");
      if (args && args.length === 2) {
        const userId = args[1];
        const isNumeric = /^\d+$/.test(userId);

        if (!isNumeric) {
          await ctx.replyWithHTML(`User_id должен иметь формат числа!`);
          return await next();
        }

        const user = await userService.findAndDeleteUser(Number(userId));

        if (user) {
          await ctx.replyWithHTML(`Удалена запись User c user_id: <b>${userId}</b>`);
        } else {
          await ctx.replyWithHTML(`Не существует записи в User user_id: <b>${userId}</b>`);
        }
      } else {
        await ctx.replyWithHTML(`Пожалуйста, используйте команду в формате: /deleteUser <user_id>`);
      }
    })
  );

  bot.command(
    "addAdmin",
    asyncWrapper(async (ctx: Context, next: Function) => {
      const admin = await Admin.findOne({ user_id: ctx.message?.from.id });
      if (!ctx.text || !admin?.isSuperAdmin) {
        return await next();
      }
      const args = ctx.text.split(" ");
      if (args && args.length === 2) {
        const userId = args[1];
        const isNumeric = /^\d+$/.test(userId);

        if (!isNumeric) {
          await ctx.replyWithHTML(`User_id должен иметь формат числа!`);
          return await next();
        }

        await createOrUpdateMainAdmin(userId, false);
        await ctx.replyWithHTML(`Добавлена запись Admin c user_id: <b>${userId}</b>, isSuperAdmin: <b>false</b>`);
      } else {
        await ctx.replyWithHTML(`Пожалуйста, используйте команду в формате: /addAdmin <user_id>`);
      }
    })
  );

  bot.command(
    "addSuperAdmin",
    asyncWrapper(async (ctx: Context, next: Function) => {
      const admin = await Admin.findOne({ user_id: ctx.message?.from.id });
      if (!ctx.text || !admin?.isSuperAdmin) {
        return await next();
      }
      const args = ctx.text.split(" ");
      if (args && args.length === 2) {
        const userId = args[1];
        const isNumeric = /^\d+$/.test(userId);

        if (!isNumeric) {
          await ctx.replyWithHTML(`User_id должен иметь формат числа!`);
          return await next();
        }

        await createOrUpdateMainAdmin(userId, true);
        await ctx.replyWithHTML(`Добавлена запись Admin c user_id: <b>${userId}</b>, isSuperAdmin: <b>${true}</b>`);
      } else {
        await ctx.replyWithHTML(`Пожалуйста, используйте команду в формате: /addSuperAdmin <user_id>`);
      }
    })
  );
}
