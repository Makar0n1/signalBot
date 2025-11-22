import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext } from "telegraf/typings/scenes";

import { REKT_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { deleteFromSession, saveToSession } from "../../utils/session";
import isNumeric from "../../utils/isNumeric";
import deleteMessages from "../../utils/deleteMessages";
import asyncWrapper from "../../utils/error-handler";
import { getMainREKTText } from "../../utils/texts";

import { getCancelKeyboard } from "../../keyboards/main.keyboard";
import Config, { IConfig } from "../../models/Config";
import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";
import getREKTKeyboard from "../../keyboards/REKT.keyboard";
import { User, IUser } from "../../models";
import { getUserLanguage } from "../../utils/i18n";

// Regex patterns for matching keyboard buttons in both languages
const REKT_SET_LIMIT_PATTERN = /^🔻 (Установить минимальную ликвидацию|Set min liquidation)$/;
const CANCEL_PATTERN = /^❌ (Отменить|Cancel)$/;

const sendMessage = new Composer<WizardContext>();
sendMessage.hears(REKT_SET_LIMIT_PATTERN, async (ctx: WizardContext) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const lang = getUserLanguage(ctx);
  const { cancelKeyboard } = getCancelKeyboard(lang);
  const msg = lang === 'ru'
    ? `🔻 <b>Текущая минимальная ликвидация - ${user.config.rekt_limit}$</b>\n\nВведи новую: от 1000$`
    : `🔻 <b>Current minimum liquidation - ${user.config.rekt_limit}$</b>\n\nEnter new value: from 1000$`;
  await ctx.replyWithHTML(msg, cancelKeyboard);
  saveToSession(ctx, 'userInfo', user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, REKT_ROUTES.SET_LIMIT);
  await ctx.wizard.next();
});

const changeREKTParam = new Composer();
changeREKTParam.hears(
  CANCEL_PATTERN,
  deleteMessageNext,
  asyncWrapper(async (ctx: WizardContext) => {
    const lang = getUserLanguage(ctx);
    const { rektKeyboard } = getREKTKeyboard(lang);
    const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
    const rektText = getMainREKTText(user.config);
    await ctx.replyWithHTML(lang === 'ru' ? "<b>❌ Отмена действия</b>" : "<b>❌ Action cancelled</b>");
    await ctx.replyWithHTML(rektText, rektKeyboard);
    return await ctx.scene.leave();
  })
);

changeREKTParam.on(
  message("text"),
  async (ctx: WizardContext, next) => {
    const num: string = ctx.message.text;
    const lang = getUserLanguage(ctx);
    const { rektKeyboard } = getREKTKeyboard(lang);

    if (!isNumeric(num)) {
      await ctx.replyWithHTML(lang === 'ru' ? `<b>Введите число!</b>` : `<b>Enter a number!</b>`);
      return;
    }

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case REKT_ROUTES.SET_LIMIT:
        if (Number(num) < 1000) {
          await ctx.replyWithHTML(lang === 'ru' ? `<b>Число должно быть >= 1000</b>` : `<b>Number must be >= 1000</b>`);
          return;
        }
        await Config.updateOne({ _id: ctx.session['userInfo'].config._id }, { rekt_limit: num });
        await ctx.replyWithHTML(
          lang === 'ru' ? `<b>Успешно изменена минимальная ликвидация, теперь равна - ${num}$</b>` : `<b>Minimum liquidation changed to ${num}$</b>`,
          rektKeyboard
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

export const SetREKT = new Scenes.WizardScene("SetREKT", sendMessage, changeREKTParam);
