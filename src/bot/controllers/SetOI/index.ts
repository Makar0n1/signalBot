import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext, WizardSessionData, WizardSession } from "telegraf/typings/scenes";

import { CANCEL_SCENE, OI_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { deleteFromSession, saveToSession } from "../../utils/session";
import deleteMessages from "../../utils/deleteMessages";
import isNumeric from "../../utils/isNumeric";
import asyncWrapper from "../../utils/error-handler";
import { isValidOIPercenteges, isValidOIPeriod } from "../../utils/validateData";
import { getMainOIText } from "../../utils/texts";

import getOIKeyboard from "../../keyboards/OI.keyboard";
import { getCancelKeyboard } from "../../keyboards/main.keyboard";

import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";

import { User, IUser, Config } from "../../models";
import { getUserLanguage } from "../../utils/i18n";

// Regex patterns for matching keyboard buttons in both languages
const OI_UP_PERIOD_PATTERN = /^📈 (Период роста|Growth Period)$/;
const OI_DOWN_PERIOD_PATTERN = /^📉 (Период просадки|Decline Period)$/;
const OI_UP_PERCENT_PATTERN = /^🟩 (Процент роста|Growth %)$/;
const OI_DOWN_PERCENT_PATTERN = /^🟥 (Процент просадки|Decline %)$/;
const CANCEL_PATTERN = /^❌ (Отменить|Cancel)$/;
import UserService from "./../../services/user.service";

interface Session extends WizardSessionData {
  change: "📈 Период роста" | "📉 Период просадки" | "🟩 Процент роста" | "🟥 Процент просадки";
  deleteMessages: string;
}

type Context = WizardContext<Session>;

const sendMessage = new Composer<Context>();
sendMessage.hears(OI_UP_PERIOD_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который OI должен вырасти на нужный % - ${user.config.oi_growth_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for OI to grow by required % - ${user.config.oi_growth_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.UP_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(OI_DOWN_PERIOD_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `⏱ <b>Текущий период времени, за который OI должен упасть на нужный % - ${user.config.oi_recession_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`
    : `⏱ <b>Current time period for OI to decline by required % - ${user.config.oi_recession_period} min</b>\n\n Enter new period: 1 to 30 minutes`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.DOWN_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(OI_UP_PERCENT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `📈 <b>Текущий % изменения (рост) OI - ${user.config.oi_growth_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📈 <b>Current OI change % (growth) - ${user.config.oi_growth_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.UP_PERCENTEGES);
  await ctx.wizard.next();
});

sendMessage.hears(OI_DOWN_PERCENT_PATTERN, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `📉 <b>Текущий % изменения (падение) OI - ${user.config.oi_recession_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`
    : `📉 <b>Current OI change % (decline) - ${user.config.oi_recession_percentage}%</b>\n\n Enter new change %: 0.1% to 100%`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.DOWN_PERCENTEGES);
  await ctx.wizard.next();
});

const changeOIParam = new Composer<Context>();

changeOIParam.hears(
  CANCEL_PATTERN,
  deleteMessageNext,
  asyncWrapper(async (ctx: Context) => {
    const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
    const lang = getUserLanguage(ctx);
    const { oiKeyboard } = getOIKeyboard(lang);
    const oiText = getMainOIText(user.config);
    await ctx.replyWithHTML(lang === 'ru' ? "<b>❌ Отмена действия</b>" : "<b>❌ Action cancelled</b>");
    await ctx.replyWithHTML(oiText, oiKeyboard);
    return await ctx.scene.leave();
  })
);

changeOIParam.on(
  message("text"),
  async (ctx: Context, next) => {
    const num: string = ctx?.message?.text;
    const lang = getUserLanguage(ctx);
    const { oiKeyboard } = getOIKeyboard(lang);

    if (!isNumeric(num)) {
      await ctx.replyWithHTML(lang === 'ru' ? `<b>Введите число!</b>` : `<b>Enter a number!</b>`);
      return;
    }

    if (!ctx?.message?.from?.id) {
      return;
    }

    const invalidIntervalMsg = lang === 'ru' ? `<b>Введите число в указанном интервале!</b>` : `<b>Enter a number within the specified range!</b>`;

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case OI_ROUTES.UP_PERIOD:
        if (!isValidOIPeriod(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_growth_period: Number(num) });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен период роста, теперь равен - ${num} мин</b>` : `<b>Growth period changed to ${num} min</b>`,
          oiKeyboard
        );
        break;
      case OI_ROUTES.UP_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_growth_percentage: Number(num) });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен % роста OI, теперь равен - ${num}%</b>` : `<b>OI growth % changed to ${num}%</b>`,
          oiKeyboard
        );
        break;
      case OI_ROUTES.DOWN_PERIOD:
        if (!isValidOIPeriod(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_recession_period: Number(num) });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен период спада, теперь равен - ${num} мин</b>` : `<b>Decline period changed to ${num} min</b>`,
          oiKeyboard
        );
        break;
      case OI_ROUTES.DOWN_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          await ctx.replyWithHTML(invalidIntervalMsg);
          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_recession_percentage: Number(num) });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменен % падения OI, теперь равен - ${num}%</b>` : `<b>OI decline % changed to ${num}%</b>`,
          oiKeyboard
        );
        break;
    }

    return next();
  },

  async (ctx: Context) => {
    deleteMessages(ctx, ctx.session[SESSION_FIELDS.DELETE_MESSAGES]);
    deleteFromSession(ctx, SESSION_FIELDS.DELETE_MESSAGES);

    return await ctx.scene.leave();
  }
);

export const SetOI = new Scenes.WizardScene<Context>("SetOI", sendMessage, changeOIParam);
