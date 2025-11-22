import { Markup } from "telegraf";
import { Exchange } from "../models";
import { Language } from "../utils/i18n";

const getExchangeKeyboard = (exchanges: Exchange[], config_id: string, lang: Language = "en") => {
  const exchangeKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(`${exchanges.includes("binance") ? "🟢" : "🔴"} Binance`, `changebinance ${config_id}`),
      Markup.button.callback(`${exchanges.includes("bybit") ? "🟢" : "🔴"} ByBit`, `changebybit ${config_id}`),
    ],
    [
      Markup.button.callback(lang === 'ru' ? "✅ Готово" : "✅ Done", "close_exchange"),
    ],
  ]).reply_markup;

  return { exchangeKeyboard };
};

export default getExchangeKeyboard;
