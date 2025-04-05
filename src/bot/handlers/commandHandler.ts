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
      const { mainKeyboard } = getMainKeyboard();

      const data = {
        user_id: ctx.message?.from.id,
        language_code: ctx.message?.from.language_code,
        username: ctx.message?.from.username,
      };
      if (data.user_id === Number(process.env.MAIN_ADMIN_TG_USER_ID)) {
        await createOrUpdateMainAdmin(String(data.user_id), true);
      }
      await guestService.createGuest(data);

      await ctx.replyWithHTML(
        `<b>👋 Привет!</b>\n\nЯ - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас, когда произойдут важные события, такие как изменение <b>открытого интереса</b>, <b>памп 📈</b> или <b>ликвидация 💥</b> всех криптовалютных пар! 💹\n\n<b>Главное меню ⬇️</b>`,
        mainKeyboard
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
        await ctx.replyWithHTML(`Пожалуйста, используйте команду в формате: /deleteUser <user_id>`);
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
        await ctx.replyWithHTML(`Пожалуйста, используйте команду в формате: /deleteUser <user_id>`);
      }
    })
  );
}
