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
import getCancelKeyboard from "../../keyboards/main.keyboard";

import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";

import { User, IUser, Config } from "../../models";
import UserService from "./../../services/user.service";

interface Session extends WizardSessionData {
  change: "📈 Период роста" | "📉 Период просадки" | "🟩 Процент роста" | "🟥 Процент просадки";
  deleteMessages: string;
}

type Context = WizardContext<Session>;

const sendMessage = new Composer<Context>();
sendMessage.hears(OI_ROUTES.UP_PERIOD, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const { cancelKeyboard } = getCancelKeyboard();
  await ctx.replyWithHTML(
    `⏱ <b>Текущий период времени, за который OI должен вырасти на нужный % - ${user.config.oi_growth_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`,
    cancelKeyboard
  );
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.UP_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(OI_ROUTES.DOWN_PERIOD, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const { cancelKeyboard } = getCancelKeyboard();
  const msg = await ctx.replyWithHTML(
    `⏱ <b>Текущий период времени, за который OI должен упасть на нужный % - ${user.config.oi_recession_period} мин</b>\n\n Введи новый период времени: от 1 до 30 минут`,
    cancelKeyboard
  );
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.DOWN_PERIOD);
  await ctx.wizard.next();
});

sendMessage.hears(OI_ROUTES.UP_PERCENTEGES, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const { cancelKeyboard } = getCancelKeyboard();
  const msg = await ctx.replyWithHTML(
    `📈 <b>Текущий % изменения (рост) OI - ${user.config.oi_growth_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`,
    cancelKeyboard
  );
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.UP_PERCENTEGES);
  await ctx.wizard.next();
});

sendMessage.hears(OI_ROUTES.DOWN_PERCENTEGES, async (ctx: Context) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
  const { cancelKeyboard } = getCancelKeyboard();
  await ctx.replyWithHTML(
    `📉 <b>Текущий % изменения (падение) OI - ${user.config.oi_recession_percentage}%</b>\n\n Введи новый % изменения цены: от 0.1% до 100%`,
    cancelKeyboard
  );
  saveToSession(ctx, "userInfo", user);
  saveToSession(ctx, SESSION_FIELDS.CHANGE, OI_ROUTES.DOWN_PERCENTEGES);
  await ctx.wizard.next();
});

const changeOIParam = new Composer<Context>();

changeOIParam.hears(
  CANCEL_SCENE,
  deleteMessageNext,
  asyncWrapper(async (ctx: Context) => {
    const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
    const { oiKeyboard } = getOIKeyboard();
    const oiText = getMainOIText(user.config);
    await ctx.replyWithHTML("<b>❌ Отмена действия</b>");
    await ctx.replyWithHTML(oiText, oiKeyboard);
    return await ctx.scene.leave();
  })
);

changeOIParam.on(
  message("text"),
  async (ctx: Context, next) => {
    const num: string = ctx?.message?.text;

    let res;
    const { oiKeyboard } = getOIKeyboard();

    if (!isNumeric(num)) {
      await ctx.replyWithHTML(`<b>Введите число!</b>`);

      return;
    }

    if (!ctx?.message?.from?.id) {
      return;
    }

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case OI_ROUTES.UP_PERIOD:
        if (!isValidOIPeriod(num)) {
          await ctx.replyWithHTML(`<b>Введите число в указанном интервале!</b>`);

          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_growth_period: Number(num) });
        await ctx.replyWithHTML(`<b>Успешно изменен период роста, теперь равен - ${num} мин</b>`, oiKeyboard);
        break;
      case OI_ROUTES.UP_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          await ctx.replyWithHTML(`<b>Введите число в указанном интервале!</b>`);

          return;
        }

        await UserService.updateUserConfig(ctx.message.from.id, { oi_growth_percentage: Number(num) });
        await ctx.replyWithHTML(`<b>Успешно изменен % роста OI, теперь равен - ${num}%</b>`, oiKeyboard);
        break;
      case OI_ROUTES.DOWN_PERIOD:
        if (!isValidOIPeriod(num)) {
          await ctx.replyWithHTML(`<b>Введите число в указанном интервале!</b>`);

          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_recession_period: Number(num) });

        await ctx.replyWithHTML(`<b>Успешно изменен период спада, теперь равен - ${num} мин</b>`, oiKeyboard);
        break;

      case OI_ROUTES.DOWN_PERCENTEGES:
        if (!isValidOIPercenteges(num)) {
          await ctx.replyWithHTML(`<b>Введите число в указанном интервале!</b>`);

          return;
        }
        await UserService.updateUserConfig(ctx.message.from.id, { oi_recession_percentage: Number(num) });

        await ctx.replyWithHTML(`<b>Успешно изменен % падения OI, теперь равен - ${num}%</b>`, oiKeyboard);
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
