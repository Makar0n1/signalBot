import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext } from "telegraf/typings/scenes";

import { PUMP_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { deleteFromSession, saveToSession } from "../../utils/session";
import isNumeric from "../../utils/isNumeric";
import deleteMessages from "../../utils/deleteMessages";
import { isValidOIPercenteges, isValidOIPeriod } from "../../utils/validateData";
import asyncWrapper from "../../utils/error-handler";
import { getMainPumpText } from "../../utils/texts";

import getPUMPKeyboard from "../../keyboards/PUMP.keyboard";
import { getCancelKeyboard } from "../../keyboards/main.keyboard";
import Config, { IConfig } from "../../models/Config";
import  {User, IUser } from "../../models";
import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";
import { getUserLanguage } from "../../utils/i18n";

// Regex patterns for matching keyboard buttons in both languages
const PUMP_UP_PERIOD_PATTERN = /^📈 (Период лонг|Long Period)$/;
const PUMP_DOWN_PERIOD_PATTERN = /^📉 (Период шорт|Short Period)$/;
const PUMP_UP_PERCENT_PATTERN = /^🟩 (Процент лонг|Long %)$/;
const PUMP_DOWN_PERCENT_PATTERN = /^🟥 (Процент шорт|Short %)$/;
const CANCEL_PATTERN = /^❌ (Отменить|Cancel)$/;

const sendMessage = new Composer<WizardContext>();
sendMessage.hears(PUMP_UP_PERIOD_PATTERN, async (ctx: WizardContext) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который цена должна вырасти на нужный % - ${user.config.pump_growth_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for price to grow by required % - ${user.config.pump_growth_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.UP_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(PUMP_DOWN_PERIOD_PATTERN, async (ctx: WizardContext) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который цена должна упасть на нужный % - ${user.config.pump_recession_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for price to decline by required % - ${user.config.pump_recession_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.DOWN_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(PUMP_UP_PERCENT_PATTERN, async (ctx: WizardContext) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `📈 <b>Текущий % изменения цены для большого пампа - ${user.config.pump_growth_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📈 <b>Current price change % for big pump - ${user.config.pump_growth_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.UP_PERCENTEGES);
  await ctx.wizard.next();
});

sendMessage.hears(PUMP_DOWN_PERCENT_PATTERN, async (ctx: WizardContext) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `📉 <b>Текущий % изменения цены для шорта - ${user.config.pump_recession_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📉 <b>Current price change % for short - ${user.config.pump_recession_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, PUMP_ROUTES.DOWN_PERCENTEGES);
  await ctx.wizard.next();
});

const changePUMPParam = new Composer();
changePUMPParam.hears(
  CANCEL_PATTERN,
  deleteMessageNext,
  asyncWrapper(async (ctx: WizardContext) => {
    const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
    const lang = getUserLanguage(ctx);
    const { pumpKeyboard } = getPUMPKeyboard(lang);
    const pumpText = getMainPumpText(user.config);
    await ctx.replyWithHTML(lang === 'ru' ? "<b>❌ Отмена действия</b>" : "<b>❌ Action cancelled</b>");
    await ctx.replyWithHTML(pumpText, pumpKeyboard);
    return await ctx.scene.leave();
  })
);

changePUMPParam.on(
  message("text"),
  async (ctx: WizardContext, next) => {
    const num: string = ctx.message.text;
    const lang = getUserLanguage(ctx);
    const { pumpKeyboard } = getPUMPKeyboard(lang);

    if (!isNumeric(num)) {
      await ctx.replyWithHTML(lang === 'ru' ? `<b>Введите число!</b>` : `<b>Enter a number!</b>`);
      return;
    }

    const invalidIntervalMsg = lang === 'ru' ? `<b>Введите число в указанном интервале!</b>` : `<b>Enter a number within the specified range!</b>`;

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case PUMP_ROUTES.UP_PERIOD:
        if (!isValidOIPeriod(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await Config.updateOne({ _id: ctx.session['userInfo'].config._id }, { pump_growth_period: num });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен период роста цены, теперь равен - ${num} мин</b>` : `<b>Price growth period changed to ${num} min</b>`,
          pumpKeyboard
        );
        break;
      case PUMP_ROUTES.UP_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await Config.updateOne({_id: ctx.session['userInfo'].config._id}, { pump_growth_percentage: num });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен % роста цены, теперь равен - ${num}%</b>` : `<b>Price growth % changed to ${num}%</b>`,
          pumpKeyboard
        );
        break;
      case PUMP_ROUTES.DOWN_PERIOD:
        if (!isValidOIPeriod(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await Config.updateOne({ _id: ctx.session['userInfo'].config._id }, { pump_recession_period: num });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен период спада, теперь равен - ${num} мин</b>` : `<b>Decline period changed to ${num} min</b>`,
          pumpKeyboard
        );
        break;
      case PUMP_ROUTES.DOWN_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await Config.updateOne({ _id: ctx.session['userInfo'].config._id }, { pump_recession_percentage: num });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен % падения цены, теперь равен - ${num}%</b>` : `<b>Price decline % changed to ${num}%</b>`,
          pumpKeyboard
        );
        break;
    }

    return next();
  },

  async (ctx: WizardContext) => {
    deleteMessages(ctx, ctx.session[SESSION_FIELDS.DELETE_MESSAGES]);
    deleteFromSession(ctx, SESSION_FIELDS.DELETE_MESSAGES);

    return await ctx.scene.leave();
  }
);

export const SetPUMP = new Scenes.WizardScene<WizardContext>("SetPUMP", sendMessage, changePUMPParam);
