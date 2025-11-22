import dotenv from "dotenv";
dotenv.config();
import { Context, Telegraf } from "telegraf";

import asyncWrapper from "../utils/error-handler";
import getMainKeyboard from "../keyboards/main.keyboard";
import guestService from "../services/guest.service";
import { Admin } from "../models";
import userService from "../services/user.service";
import { createOrUpdateMainAdmin } from "..";
import { tc, getUserLanguage, setUserLanguage, t } from "../utils/i18n";

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

      // Load user's preferred language and set in cache
      if (user.preferred_language && data.user_id) {
        setUserLanguage(data.user_id, user.preferred_language);
      }

      const now = new Date();
      const lang = getUserLanguage(ctx);

      // Check if user is admin
      if (user.is_admin) {
        const { mainKeyboard } = getMainKeyboard(lang);
        await ctx.replyWithHTML(
          tc(ctx, "admin.welcome"),
          mainKeyboard
        );
        return;
      }

      // Check if user has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard(lang);
        await ctx.replyWithHTML(
          tc(ctx, "admin.welcome"), // Using same message for returning users
          mainKeyboard
        );
        return;
      }

      // Check if trial is active
      if (user.trial_expires_at && user.trial_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard(lang);
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
              [{ text: tc(ctx, "btn.why_paid"), callback_data: "why_paid" }],
              [{ text: "🌐 Language / Язык", callback_data: "select_language" }]
            ]
          }
        }
      );
    })
  );

  // Handle language selection button
  bot.action("select_language", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { User } = await import("../models/index.js");

      const userId = ctx.from?.id;
      if (!userId) return;

      const user = await User.findOne({ user_id: userId });
      const now = new Date();
      const hasAccess = user?.is_admin ||
        (user?.subscription_active && user?.subscription_expires_at && user.subscription_expires_at > now) ||
        (user?.trial_expires_at && user.trial_expires_at > now);

      // For users with access, don't show back_to_start button (which goes to welcome page)
      // Instead show a simple language selection
      await ctx.editMessageText(
        tc(ctx, "language.select"),
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🇺🇸 English", callback_data: "set_lang_en" },
                { text: "🇷🇺 Русский", callback_data: "set_lang_ru" }
              ],
              ...(hasAccess ? [] : [[{ text: tc(ctx, "btn.back"), callback_data: "back_to_start" }]])
            ]
          }
        }
      );
    } catch (error) {
      console.error("Error in select_language handler", error);
    }
  });

  // Handle language change to English
  bot.action("set_lang_en", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { User } = await import("../models/index.js");

      const userId = ctx.from?.id;
      if (!userId) return;

      // Update user's language preference
      await User.updateOne({ user_id: userId }, { preferred_language: "en" });
      setUserLanguage(userId, "en");

      const user = await User.findOne({ user_id: userId });
      const now = new Date();

      // Check user status and show appropriate message
      if (user?.is_admin || (user?.subscription_active && user?.subscription_expires_at && user.subscription_expires_at > now) || (user?.trial_expires_at && user.trial_expires_at > now)) {
        // User has access - delete inline message and show confirmation with main keyboard
        try {
          await ctx.deleteMessage();
        } catch (e) {}

        const { mainKeyboard } = getMainKeyboard("en");
        const msg = await ctx.replyWithHTML(
          t("language.changed", "en"),
          mainKeyboard
        );

        // Auto-delete confirmation message after 2 seconds
        setTimeout(async () => {
          try {
            await ctx.telegram.deleteMessage(ctx.chat!.id, msg.message_id);
          } catch (e) {}
        }, 2000);
      } else {
        // User without access - just show confirmation and delete
        await ctx.editMessageText(
          t("language.changed", "en"),
          { parse_mode: "HTML" }
        );

        // Auto-delete after 2 seconds
        setTimeout(async () => {
          try {
            await ctx.deleteMessage();
          } catch (e) {}
        }, 2000);
      }
    } catch (error) {
      console.error("Error in set_lang_en handler", error);
    }
  });

  // Handle language change to Russian
  bot.action("set_lang_ru", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { User } = await import("../models/index.js");

      const userId = ctx.from?.id;
      if (!userId) return;

      // Update user's language preference
      await User.updateOne({ user_id: userId }, { preferred_language: "ru" });
      setUserLanguage(userId, "ru");

      const user = await User.findOne({ user_id: userId });
      const now = new Date();

      // Check user status and show appropriate message
      if (user?.is_admin || (user?.subscription_active && user?.subscription_expires_at && user.subscription_expires_at > now) || (user?.trial_expires_at && user.trial_expires_at > now)) {
        // User has access - delete inline message and show confirmation with main keyboard
        try {
          await ctx.deleteMessage();
        } catch (e) {}

        const { mainKeyboard } = getMainKeyboard("ru");
        const msg = await ctx.replyWithHTML(
          t("language.changed", "ru"),
          mainKeyboard
        );

        // Auto-delete confirmation message after 2 seconds
        setTimeout(async () => {
          try {
            await ctx.telegram.deleteMessage(ctx.chat!.id, msg.message_id);
          } catch (e) {}
        }, 2000);
      } else {
        // User without access - just show confirmation and delete
        await ctx.editMessageText(
          t("language.changed", "ru"),
          { parse_mode: "HTML" }
        );

        // Auto-delete after 2 seconds
        setTimeout(async () => {
          try {
            await ctx.deleteMessage();
          } catch (e) {}
        }, 2000);
      }
    } catch (error) {
      console.error("Error in set_lang_ru handler", error);
    }
  });

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
