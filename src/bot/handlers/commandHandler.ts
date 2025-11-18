import dotenv from "dotenv";
dotenv.config();
import { Context, Telegraf } from "telegraf";

import asyncWrapper from "../utils/error-handler";
import getMainKeyboard from "../keyboards/main.keyboard";
import guestService from "../services/guest.service";
import { Admin } from "../models";
import userService from "../services/user.service";
import { createOrUpdateMainAdmin } from "..";
import { tc, getUserLanguage } from "../utils/i18n";

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

      // Create or find user
      await userService.createUser(data);
      const user = await User.findOne({ user_id: data.user_id });

      if (!user) {
        await ctx.replyWithHTML(tc(ctx, "error.user_create"));
        return;
      }

      const now = new Date();
      const lang = getUserLanguage(ctx);

      // Check if user is admin
      if (user.is_admin) {
        const { mainKeyboard } = getMainKeyboard();
        await ctx.replyWithHTML(
          tc(ctx, "admin.welcome"),
          mainKeyboard
        );
        return;
      }

      // Check if user has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard();
        await ctx.replyWithHTML(
          tc(ctx, "admin.welcome"), // Using same message for returning users
          mainKeyboard
        );
        return;
      }

      // Check if trial is active
      if (user.trial_expires_at && user.trial_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard();
        const hoursLeft = Math.ceil((user.trial_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60));
        const trialActive = lang === "ru"
          ? `✨ <b>У вас активен триал на ${hoursLeft} часов</b>`
          : `✨ <b>You have ${hoursLeft} hours of trial left</b>`;
        await ctx.replyWithHTML(
          `${tc(ctx, "trial.activated.title")}\n\n${tc(ctx, "welcome.intro")}\n\n${trialActive}\n\n${tc(ctx, "menu.bot_intro")}`,
          mainKeyboard
        );
        return;
      }

      // New user or trial expired - show welcome message with subscription options
      await ctx.replyWithHTML(
        `${tc(ctx, "welcome.title")}\n\n` +
        `${tc(ctx, "welcome.intro")}\n\n` +
        `${tc(ctx, "welcome.features.title")}\n` +
        `${tc(ctx, "welcome.features.oi")}\n` +
        `${tc(ctx, "welcome.features.pump")}\n` +
        `${tc(ctx, "welcome.features.rekt")}\n\n` +
        `${tc(ctx, "welcome.trial.title")}\n` +
        `${tc(ctx, "welcome.trial.text")}\n\n` +
        `${tc(ctx, "welcome.price")}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: tc(ctx, "btn.start_trial"), callback_data: "start_trial" }],
              [{ text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }],
              [{ text: tc(ctx, "btn.why_paid"), callback_data: "why_paid" }]
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
