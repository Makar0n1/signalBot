import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext, WizardSessionData } from "telegraf/typings/scenes";

import { REKT_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { saveToSession } from "../../utils/session";
import isNumeric from "../../utils/isNumeric";
import asyncWrapper from "../../utils/error-handler";
import { getMainREKTText } from "../../utils/texts";

import { getCancelKeyboard } from "../../keyboards/main.keyboard";
import Config from "../../models/Config";
import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";
import getREKTKeyboard from "../../keyboards/REKT.keyboard";
import { User } from "../../models";
import { getUserLanguage } from "../../utils/i18n";

// Regex patterns for matching keyboard buttons in both languages
const REKT_SET_LIMIT_PATTERN = /^🔻 (Установить минимальную ликвидацию|Set Minimum Liquidation)$/;
const CANCEL_PATTERN = /^❌ (Отменить|Cancel)$/;

interface MySession extends WizardSessionData {
  change: string;
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

sendMessage.hears(REKT_SET_LIMIT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `🔻 <b>Текущая минимальная ликвидация - ${user!.config.rekt_limit}$</b>\n\nВведи новую: от 1000$`
    : `🔻 <b>Current minimum liquidation - ${user!.config.rekt_limit}$</b>\n\nEnter new value: from 1000$`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, REKT_ROUTES.SET_LIMIT);
  await ctx.wizard.next();
});

const changeREKTParam = new Composer<Context>();

changeREKTParam.hears(
  CANCEL_PATTERN,
  deleteMessageNext,
  asyncWrapper(async (ctx: Context) => {
    const lang = getUserLanguage(ctx);
    const { rektKeyboard } = getREKTKeyboard(lang);
    const userId = ctx.message?.from.id;

    // Add cancel button message to delete list
    ctx.session.messagesToDelete = ctx.session.messagesToDelete || [];
    ctx.session.messagesToDelete.push(ctx.message!.message_id);

    // Delete all stored messages
    await deleteStoredMessages(ctx);

    // Delete old settings message from DB
    const user = await User.findOne({ user_id: userId }).populate('config');
    if (user?.settings_message_id && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, user.settings_message_id);
      } catch (e) {}
    }

    // Get updated user config and show REKT menu
    const rektText = getMainREKTText(user!.config, lang);
    const sentMessage = await ctx.replyWithHTML(rektText, rektKeyboard);

    // Update settings_message_id with new message
    await User.updateOne({ user_id: userId }, { settings_message_id: sentMessage.message_id });

    return await ctx.scene.leave();
  })
);

changeREKTParam.on(
  message("text"),
  async (ctx: Context, next) => {
    const num: string = ctx.message?.text || "";
    const lang = getUserLanguage(ctx);
    const { rektKeyboard } = getREKTKeyboard(lang);

    // Add user's input message to delete list
    ctx.session.messagesToDelete = ctx.session.messagesToDelete || [];
    ctx.session.messagesToDelete.push(ctx.message!.message_id);

    if (!isNumeric(num)) {
      const errMsg = await ctx.replyWithHTML(lang === 'ru' ? `<b>Введите число!</b>` : `<b>Enter a number!</b>`);
      ctx.session.messagesToDelete.push(errMsg.message_id);
      return;
    }

    let successMsg = "";

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case REKT_ROUTES.SET_LIMIT:
        if (Number(num) < 1000) {
          const errMsg = await ctx.replyWithHTML(lang === 'ru' ? `<b>Число должно быть >= 1000</b>` : `<b>Number must be >= 1000</b>`);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await Config.updateOne({ _id: ctx.session.userInfo.config._id }, { rekt_limit: num });
        successMsg = lang === 'ru' ? `✅ <b>Минимальная ликвидация изменена на ${num}$</b>` : `✅ <b>Minimum liquidation changed to ${num}$</b>`;
        break;
    }

    // Delete all settings messages
    await deleteStoredMessages(ctx);

    // Delete old settings message from DB
    const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
    if (user?.settings_message_id && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, user.settings_message_id);
      } catch (e) {}
    }

    // Get updated user config and show REKT menu
    const rektText = getMainREKTText(user!.config, lang);

    // Send success notification that auto-deletes after 2 seconds
    const successNotif = await ctx.replyWithHTML(successMsg);

    // Show updated settings with REKT keyboard
    const sentMessage = await ctx.replyWithHTML(rektText, rektKeyboard);

    // Update settings_message_id with new message
    await User.updateOne({ user_id: ctx.message?.from.id }, { settings_message_id: sentMessage.message_id });

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

export const SetREKT = new Scenes.WizardScene<Context>("SetREKT", sendMessage, changeREKTParam);
