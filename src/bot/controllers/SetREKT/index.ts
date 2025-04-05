import { Composer, Scenes } from "telegraf";
import { message } from "telegraf/filters";
import { WizardContext } from "telegraf/typings/scenes";

import { CANCEL_SCENE, PUMP_ROUTES, REKT_ROUTES, SESSION_FIELDS } from "../../utils/CONST";
import { deleteFromSession, saveToSession } from "../../utils/session";
import isNumeric from "../../utils/isNumeric";
import deleteMessages from "../../utils/deleteMessages";
import { isValidOIPercenteges, isValidOIPeriod } from "../../utils/validateData";
import asyncWrapper from "../../utils/error-handler";
import { getMainPumpText, getMainREKTText } from "../../utils/texts";

import getPUMPKeyboard from "../../keyboards/PUMP.keyboard";
import getCancelKeyboard from "../../keyboards/main.keyboard copy";
import Config, { IConfig } from "../../models/Config";
import { deleteMessageNext } from "../../middlewares/deleteMessages.middleware";
import getREKTKeyboard from "../../keyboards/REKT.keyboard";
import  {User, IUser } from "../../models";

const sendMessage = new Composer<WizardContext>();
sendMessage.hears(REKT_ROUTES.SET_LIMIT, async (ctx: WizardContext) => {
  const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
  const { cancelKeyboard } = getCancelKeyboard();
  await ctx.replyWithHTML(
    `🔻 <b>Текущая минимальная ликвидация - ${user.config.rekt_limit}$</b>\n\nВведи новую: от 1000$`,
    cancelKeyboard
  );
  saveToSession(ctx, 'userInfo', user)
  saveToSession(ctx, SESSION_FIELDS.CHANGE, REKT_ROUTES.SET_LIMIT);
  await ctx.wizard.next();
});

const changeREKTParam = new Composer();
changeREKTParam.hears(
  CANCEL_SCENE,
  deleteMessageNext,
  asyncWrapper(async (ctx: WizardContext) => {
    const { rektKeyboard } = getREKTKeyboard();
    const user = await User.findOne({ user_id: ctx.message?.from.id }).populate('config');
    const rektText = getMainREKTText(user.config);
    await ctx.replyWithHTML("<b>❌ Отмена действия</b>");
    await ctx.replyWithHTML(rektText, rektKeyboard);
    return await ctx.scene.leave();
  })
);

changeREKTParam.on(
  message("text"),
  async (ctx: WizardContext, next) => {
    const num: string = ctx.message.text;
    
    let res;
    const { rektKeyboard } = getREKTKeyboard();

    if (!isNumeric(num)) {
      await ctx.replyWithHTML(`<b>Введите число!</b>`);

      return;
    }

    switch (ctx.session[SESSION_FIELDS.CHANGE]) {
      case REKT_ROUTES.SET_LIMIT:
        if (Number(num) < 1000) {
          await ctx.replyWithHTML(`<b>Число должно быть >= 100</b>`);

          return;
        }

        res = await Config.updateOne({ _id: ctx.session['userInfo'].config._id }, { rekt_limit: num });
        await ctx.replyWithHTML(`<b>Успешно изменена минимальная ликвидация, теперь равна - ${num}$</b>`, rektKeyboard);
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
