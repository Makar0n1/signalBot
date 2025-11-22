import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext, WizardSessionData } from "telegraf/typings/scenes";

import { OI_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { deleteFromSession, saveToSession } from "../../utils/session";
import isNumeric from "../../utils/isNumeric";
import asyncWrapper from "../../utils/error-handler";
import { isValidOIPercenteges, isValidOIPeriod } from "../../utils/validateData";
import { getMainOIText } from "../../utils/texts";

import getOIKeyboard from "../../keyboards/OI.keyboard";
import { getCancelKeyboard } from "../../keyboards/main.keyboard";

import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";

import { User } from "../../models";
import { getUserLanguage } from "../../utils/i18n";
import UserService from "./../../services/user.service";

// Regex patterns for matching keyboard buttons in both languages
const OI_UP_PERIOD_PATTERN = /^📈 (Период роста|Growth Period)$/;
const OI_DOWN_PERIOD_PATTERN = /^📉 (Период просадки|Decline Period)$/;
const OI_UP_PERCENT_PATTERN = /^🟩 (Процент роста|Growth %)$/;
const OI_DOWN_PERCENT_PATTERN = /^🟥 (Процент просадки|Decline %)$/;
const CANCEL_PATTERN = /^❌ (Отменить|Cancel)$/;

interface MySession extends WizardSessionData {
  change: string;
  deleteMessages: string;
  messagesToDelete: number[];
  userInfo: any;
}

type Context = WizardContext<MySession> & { session: MySession };

// Helper function to delete messages stored in session
async function deleteStoredMessages(ctx: Context) {
  const messagesToDelete = ctx.session.messagesToDelete || [];
  const chatId = ctx.chat?.id;

  if (chatId) {
    for (const msgId of messagesToDelete) {
      try {
        await ctx.telegram.deleteMessage(chatId, msgId);
      } catch (e) {}
    }
  }

  ctx.session.messagesToDelete = [];
}

const sendMessage = new Composer<Context>();

sendMessage.hears(OI_UP_PERIOD_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  // Initialize messages to delete array and store user's button message
  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который OI должен вырасти на нужный % - ${user!.config.oi_growth_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for OI to grow by required % - ${user!.config.oi_growth_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.UP_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(OI_DOWN_PERIOD_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который OI должен упасть на нужный % - ${user!.config.oi_recession_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for OI to decline by required % - ${user!.config.oi_recession_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.DOWN_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(OI_UP_PERCENT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `📈 <b>Текущий % изменения (рост) OI - ${user!.config.oi_growth_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📈 <b>Current OI change % (growth) - ${user!.config.oi_growth_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.UP_PERCENTEGES);
  await ctx.wizard.next();
});

sendMessage.hears(OI_DOWN_PERCENT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `📉 <b>Текущий % изменения (падение) OI - ${user!.config.oi_recession_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📉 <b>Current OI change % (decline) - ${user!.config.oi_recession_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.DOWN_PERCENTEGES);
  await ctx.wizard.next();
});

const changeOIParam = new Composer<Context>();

changeOIParam.hears(
  CANCEL_PATTERN,
  deleteMessageNext,
  asyncWrapper(async (ctx: Context) => {
    const lang = getUserLanguage(ctx);
    const { oiKeyboard } = getOIKeyboard(lang);
    const userId = ctx.message?.from.id;

    // Add cancel button message to delete list
    ctx.session.messagesToDelete = ctx.session.messagesToDelete || [];
    ctx.session.messagesToDelete.push(ctx.message!.message_id);

    // Delete all stored messages
    await deleteStoredMessages(ctx);

    // Delete old settings message from DB
    const user = await User.findOne({ user_id: userId }).populate("config");
    if (user?.settings_message_id && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, user.settings_message_id);
      } catch (e) {}
    }

    // Get updated user config and show OI menu
    const oiText = getMainOIText(user!.config, lang);
    const sentMessage = await ctx.replyWithHTML(oiText, oiKeyboard);

    // Update settings_message_id with new message
    await User.updateOne({ user_id: userId }, { settings_message_id: sentMessage.message_id });

    return await ctx.scene.leave();
  })
);

changeOIParam.on(
  message("text"),
  async (ctx: Context, next) => {
    const num: string = ctx.message?.text || "";
    const lang = getUserLanguage(ctx);
    const { oiKeyboard } = getOIKeyboard(lang);

    // Add user's input message to delete list
    ctx.session.messagesToDelete = ctx.session.messagesToDelete || [];
    ctx.session.messagesToDelete.push(ctx.message!.message_id);

    if (!isNumeric(num)) {
      const errMsg = await ctx.replyWithHTML(lang === 'ru' ? `<b>Введите число!</b>` : `<b>Enter a number!</b>`);
      ctx.session.messagesToDelete.push(errMsg.message_id);
      return;
    }

    if (!ctx?.message?.from?.id) {
      return;
    }

    const invalidIntervalMsg = lang === 'ru' ? `<b>Введите число в указанном интервале!</b>` : `<b>Enter a number within the specified range!</b>`;

    let successMsg = "";

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case OI_ROUTES.UP_PERIOD:
        if (!isValidOIPeriod(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_growth_period: Number(num) });
        successMsg = lang === 'ru' ? `✅ <b>Период роста изменен на ${num} мин</b>` : `✅ <b>Growth period changed to ${num} min</b>`;
        break;
      case OI_ROUTES.UP_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_growth_percentage: Number(num) });
        successMsg = lang === 'ru' ? `✅ <b>% роста OI изменен на ${num}%</b>` : `✅ <b>OI growth % changed to ${num}%</b>`;
        break;
      case OI_ROUTES.DOWN_PERIOD:
        if (!isValidOIPeriod(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_recession_period: Number(num) });
        successMsg = lang === 'ru' ? `✅ <b>Период спада изменен на ${num} мин</b>` : `✅ <b>Decline period changed to ${num} min</b>`;
        break;
      case OI_ROUTES.DOWN_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_recession_percentage: Number(num) });
        successMsg = lang === 'ru' ? `✅ <b>% падения OI изменен на ${num}%</b>` : `✅ <b>OI decline % changed to ${num}%</b>`;
        break;
    }

    // Delete all settings messages
    await deleteStoredMessages(ctx);

    // Delete old settings message from DB
    const user = await User.findOne({ user_id: ctx.message.from.id }).populate("config");
    if (user?.settings_message_id && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, user.settings_message_id);
      } catch (e) {}
    }

    // Get updated user config and show OI menu with updated settings
    const oiText = getMainOIText(user!.config, lang);

    // Send success notification that auto-deletes after 2 seconds
    const successNotif = await ctx.replyWithHTML(successMsg);

    // Show updated settings with OI keyboard
    const sentMessage = await ctx.replyWithHTML(oiText, oiKeyboard);

    // Update settings_message_id with new message
    await User.updateOne({ user_id: ctx.message.from.id }, { settings_message_id: sentMessage.message_id });

    // Delete success notification after 2 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, successNotif.message_id);
      } catch (e) {}
    }, 2000);

    return next();
  },

  async (ctx: Context) => {
    return await ctx.scene.leave();
  }
);

export const SetOI = new Scenes.WizardScene<Context>("SetOI", sendMessage, changeOIParam);
