import { Markup } from "telegraf";
import { Exchange } from "../models";

const getExchangeKeyboard = (exchanges: Exchange[], config_id: string) => {
  const exchangeKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(`${exchanges.includes("binance") ? "🟢" : "🔴"} Binance`, `changebinance ${config_id}`),
      Markup.button.callback(`${exchanges.includes("bybit") ? "🟢" : "🔴"} ByBit`, `changebybit ${config_id}`),
    ],
  ]).reply_markup;

  return { exchangeKeyboard };
};

export default getExchangeKeyboard;
