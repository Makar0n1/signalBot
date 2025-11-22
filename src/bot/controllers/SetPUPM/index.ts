import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext, WizardSessionData } from "telegraf/typings/scenes";

import { PUMP_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { saveToSession } from "../../utils/session";
import isNumeric from "../../utils/isNumeric";
import { isValidOIPercenteges, isValidOIPeriod } from "../../utils/validateData";
import asyncWrapper from "../../utils/error-handler";
import { getMainPumpText } from "../../utils/texts";

import getPUMPKeyboard from "../../keyboards/PUMP.keyboard";
import { getCancelKeyboard } from "../../keyboards/main.keyboard";
import Config from "../../models/Config";
import { User } from "../../models";
import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";
import { getUserLanguage } from "../../utils/i18n";

// Regex patterns for matching keyboard buttons in both languages
const PUMP_UP_PERIOD_PATTERN = /^📈 (Период лонг|Long Period)$/;
const PUMP_DOWN_PERIOD_PATTERN = /^📉 (Период шорт|Short Period)$/;
const PUMP_UP_PERCENT_PATTERN = /^🟩 (Процент лонг|Long %)$/;
const PUMP_DOWN_PERCENT_PATTERN = /^🟥 (Процент шорт|Short %)$/;
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

sendMessage.hears(PUMP_UP_PERIOD_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который цена должна вырасти на нужный % - ${user!.config.pump_growth_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for price to grow by required % - ${user!.config.pump_growth_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.UP_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(PUMP_DOWN_PERIOD_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который цена должна упасть на нужный % - ${user!.config.pump_recession_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for price to decline by required % - ${user!.config.pump_recession_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.DOWN_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(PUMP_UP_PERCENT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `📈 <b>Текущий % изменения цены для большого пампа - ${user!.config.pump_growth_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📈 <b>Current price change % for big pump - ${user!.config.pump_growth_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.UP_PERCENTEGES);
  await ctx.wizard.next();
});

sendMessage.hears(PUMP_DOWN_PERCENT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);

  ctx.session.messagesToDelete = [ctx.message!.message_id];

  const msg = lang === 'ru'
    ? `📉 <b>Текущий % изменения цены для шорта - ${user!.config.pump_recession_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📉 <b>Current price change % for short - ${user!.config.pump_recession_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  const sentMsg = await ctx.replyWithHTML(msg, cancelKeyboard);
  ctx.session.messagesToDelete.push(sentMsg.message_id);

  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.DOWN_PERCENTEGES);
  await ctx.wizard.next();
});

const changePUMPParam = new Composer<Context>();

changePUMPParam.hears(
  CANCEL_PATTERN,
  deleteMessageNext,
  asyncWrapper(async (ctx: Context) => {
    const lang = getUserLanguage(ctx);
    const { pumpKeyboard } = getPUMPKeyboard(lang);
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

    // Get updated user config and show PUMP menu
    const pumpText = getMainPumpText(user!.config, lang);
    const sentMessage = await ctx.replyWithHTML(pumpText, pumpKeyboard);

    // Update settings_message_id with new message
    await User.updateOne({ user_id: userId }, { settings_message_id: sentMessage.message_id });

    return await ctx.scene.leave();
  })
);

changePUMPParam.on(
  message("text"),
  async (ctx: Context, next) => {
    const num: string = ctx.message?.text || "";
    const lang = getUserLanguage(ctx);
    const { pumpKeyboard } = getPUMPKeyboard(lang);

    // Add user's input message to delete list
    ctx.session.messagesToDelete = ctx.session.messagesToDelete || [];
    ctx.session.messagesToDelete.push(ctx.message!.message_id);

    if (!isNumeric(num)) {
      const errMsg = await ctx.replyWithHTML(lang === 'ru' ? `<b>Введите число!</b>` : `<b>Enter a number!</b>`);
      ctx.session.messagesToDelete.push(errMsg.message_id);
      return;
    }

    const invalidIntervalMsg = lang === 'ru' ? `<b>Введите число в указанном интервале!</b>` : `<b>Enter a number within the specified range!</b>`;

    let successMsg = "";

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case PUMP_ROUTES.UP_PERIOD:
        if (!isValidOIPeriod(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await Config.updateOne({ _id: ctx.session.userInfo.config._id }, { pump_growth_period: num });
        successMsg = lang === 'ru' ? `✅ <b>Период роста цены изменен на ${num} мин</b>` : `✅ <b>Price growth period changed to ${num} min</b>`;
        break;
      case PUMP_ROUTES.UP_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await Config.updateOne({ _id: ctx.session.userInfo.config._id }, { pump_growth_percentage: num });
        successMsg = lang === 'ru' ? `✅ <b>% роста цены изменен на ${num}%</b>` : `✅ <b>Price growth % changed to ${num}%</b>`;
        break;
      case PUMP_ROUTES.DOWN_PERIOD:
        if (!isValidOIPeriod(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await Config.updateOne({ _id: ctx.session.userInfo.config._id }, { pump_recession_period: num });
        successMsg = lang === 'ru' ? `✅ <b>Период спада изменен на ${num} мин</b>` : `✅ <b>Decline period changed to ${num} min</b>`;
        break;
      case PUMP_ROUTES.DOWN_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          const errMsg = await ctx.replyWithHTML(invalidIntervalMsg);
          ctx.session.messagesToDelete.push(errMsg.message_id);
          return;
        }
        await Config.updateOne({ _id: ctx.session.userInfo.config._id }, { pump_recession_percentage: num });
        successMsg = lang === 'ru' ? `✅ <b>% падения цены изменен на ${num}%</b>` : `✅ <b>Price decline % changed to ${num}%</b>`;
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

    // Get updated user config and show PUMP menu
    const pumpText = getMainPumpText(user!.config, lang);

    // Send success notification that auto-deletes after 2 seconds
    const successNotif = await ctx.replyWithHTML(successMsg);

    // Show updated settings with PUMP keyboard
    const sentMessage = await ctx.replyWithHTML(pumpText, pumpKeyboard);

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

export const SetPUMP = new Scenes.WizardScene<Context>("SetPUMP", sendMessage, changePUMPParam);
