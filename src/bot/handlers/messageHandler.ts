import { Context, Telegraf } from "telegraf";

import { BACK_ROUTES, CANCEL_SCENE, MAIN_ROUTES, OI_ROUTES, PUMP_ROUTES, REKT_ROUTES } from "../utils/CONST";
import asyncWrapper from "../utils/error-handler";
import getMainKeyboard from "../keyboards/main.keyboard";
import getOIKeyboard from "../keyboards/OI.keyboard";
import getPUMPKeyboard from "../keyboards/PUMP.keyboard";
import getREKTKeyboard from "../keyboards/REKT.keyboard";
import { User } from "../models";
import { deleteMessageNext } from "../middlewares/deleteMessages.middleware";
import { getMainOIText, getMainPumpText, getMainREKTText } from "../utils/texts";
import { isUser } from "../middlewares";
import getExchangeKeyboard from "../keyboards/Exchange.keyboard";

export default function handlers(bot: Telegraf<Context>) {
  // OI screener
  bot.hears(
    MAIN_ROUTES.OI,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const { oiKeyboard } = getOIKeyboard();
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      const oiText = getMainOIText(user.config);
      await ctx.replyWithHTML(oiText, oiKeyboard);
    })
  );

  // PUMP screener
  bot.hears(
    MAIN_ROUTES.PUMP,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const { pumpKeyboard } = getPUMPKeyboard();
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      const pumpText = getMainPumpText(user.config);

      await ctx.replyWithHTML(pumpText, pumpKeyboard);
    })
  );

  // REKT screener
  bot.hears(
    MAIN_ROUTES.REKT,
    isUser,
    asyncWrapper(async (ctx: Context, next: Function) => {
      const { rektKeyboard } = getREKTKeyboard();
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");
      if (!user?.config) {
        return next();
      }

      const rektText = getMainREKTText(user.config);
      await ctx.replyWithHTML(rektText, rektKeyboard);
    })
  );

  // Exchanges
  bot.hears(
    MAIN_ROUTES.Exchange,
    isUser,
    asyncWrapper(async (ctx: Context, next: Function) => {
      const user = await User.findOne({ user_id: ctx.message?.from.id }).populate("config");

      if (!user?.config) {
        return next();
      }

      const { exchangeKeyboard } = getExchangeKeyboard(user?.config.exchange, user?.config.id);

      await ctx.replyWithHTML("Нажмите на <b>кнопку</b> биржи, чтобы поменять её статус", {
        reply_markup: exchangeKeyboard,
      });
    })
  );

  // PUMP screener
  bot.hears(
    BACK_ROUTES.BACK,
    isUser,
    asyncWrapper(async (ctx: Context) => {
      const { mainKeyboard } = getMainKeyboard();

      await ctx.replyWithHTML("<b>Главное меню</b>", mainKeyboard);
    })
  );

  // 📈 Период роста OI
  bot.hears(
    OI_ROUTES.UP_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // 📉 Период просадки
  bot.hears(
    OI_ROUTES.DOWN_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // 🟩 Процент роста
  bot.hears(
    OI_ROUTES.UP_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // 🟥 Процент просадки
  bot.hears(
    OI_ROUTES.DOWN_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetOI"))
  );

  // Pump

  // 📈 Период лонг
  bot.hears(
    PUMP_ROUTES.UP_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 📉 Период шорт
  bot.hears(
    PUMP_ROUTES.DOWN_PERIOD,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 🟩 Процент лонг
  bot.hears(
    PUMP_ROUTES.UP_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 🟥 Процент шорт
  bot.hears(
    PUMP_ROUTES.DOWN_PERCENTEGES,
    isUser,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetPUMP"))
  );

  // 🟥 Процент шорт
  bot.hears(
    CANCEL_SCENE,
    isUser,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context) => {
      return await ctx.scene.leave();
    })
  );

  // Ликвадация настройка
  bot.hears(
    REKT_ROUTES.SET_LIMIT,
    isUser,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context) => await ctx.scene.enter("SetREKT"))
  );
}
