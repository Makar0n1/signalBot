import { Context, Telegraf } from "telegraf";

import { ACTIONS } from "../utils/CONST.js";
import asyncWrapper from "../utils/error-handler";
import { deleteMessageNext } from "../middlewares/deleteMessages.middleware.js";
import { isUser } from "../middlewares/role.middleware.js";
import Config, { Exchange } from "../models/Config.js";
import getExchangeKeyboard from "../keyboards/Exchange.keyboard.js";
import { CallbackQuery, Update } from "telegraf/typings/core/types/typegram.js";
import { GetUpdateContent } from "telegraf/typings/context.js";
import { ObjectId } from "mongodb";

export default function handler(bot: Telegraf<Context>) {
  // Empty task
  bot.action(
    ACTIONS.NONE,
    asyncWrapper(async (ctx: Context) => {
      await ctx.answerCbQuery();
    })
  );

  // Close message with inlineButton keyboard
  bot.action(
    ACTIONS.CLOSE,
    deleteMessageNext,
    asyncWrapper(async (ctx: Context<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>) => {
      await ctx.answerCbQuery();
      return await ctx.scene.leave();
    })
  );

  // Close message with inlineButton keyboard
  bot.action(
    /^(changebybit|changebinance) (\w+)$/,

    asyncWrapper(async (ctx: Context<Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>, next: Function) => {
      if (!ctx?.callbackQuery?.data) {
        await ctx.answerCbQuery();
        return next();
      }
      const config_id = ctx.callbackQuery.data.split(" ")[1];
      const exchange = ctx.callbackQuery.data.split(" ")[0].replace("change", "") as Exchange;
      const config = await Config.findOne({ _id: new ObjectId(config_id) });

      if (!config) {
        await ctx.answerCbQuery();
        return;
      }

      const newExchange = config.exchange.includes(exchange)
        ? config.exchange.filter((item) => item !== exchange)
        : [...config.exchange, exchange];

      const newConfig = await Config.findOneAndUpdate({ _id: config_id }, { exchange: newExchange }, { new: true });

      if (!newConfig) {
        await ctx.answerCbQuery();
        return next();
      }

      const { exchangeKeyboard } = getExchangeKeyboard(newConfig.exchange, newConfig.id);

      await ctx.editMessageReplyMarkup(exchangeKeyboard);
      await ctx.answerCbQuery();
    })
  );
}
