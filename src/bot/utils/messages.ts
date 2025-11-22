type ExchangeType = "BINANCE" | "BYBIT";

export const update_oi = (
  symbol: string,
  period: number,
  oi_perseteges: number,
  oi_change_value: number,
  change_price: number,
  signals_count: number,
  type: "recession" | "growth",
  from: ExchangeType,
  lang: "ru" | "en" = "en"
): string => {
  let message: string = "";
  message += from === "BINANCE" ? "💎 <b>Binance</b> 💎\n\n" : "💵 <b>ByBit</b> 💵\n\n";
  message += `🟣 ${lang === "ru" ? "Изменение OI" : "OI Change"} — <i>${period}${lang === "ru" ? "м" : "m"}</i> — <b>#${symbol}</b> 🟣\n`;
  message += `<b>${type === "growth" ? "📈 OI:" : "📉 OI:"} ${
    type === "growth" ? `+${oi_perseteges}` : `-${oi_perseteges}`
  }% (${type === "growth" ? "+" : "-"}${oi_change_value} $)</b>\n`;
  message += `<b>💰 ${lang === "ru" ? "Изменение цены" : "Price change"}: ${change_price}%</b>\n`;
  message += `❗️ ${lang === "ru" ? "Сигналов за сутки" : "Signals today"}: ${signals_count}\n\n`;

  message += from !== "BINANCE" ? `<a href="https://www.bybit.com/trade/usdt/${symbol}">Bybit</a> | ` : "";
  message += from !== "BYBIT" ? `<a href="https://www.binance.com/en/futures/${symbol}">Binance</a> | ` : "";
  message += `<a href="https://www.coinglass.com/tv/en/Bybit_${symbol}">Coinglass</a>`;

  return message;
};

export function formatNumberToMillion(number: number): number {
  const million = 1_000_000;
  let formattedNumber = number / million;

  // Округляем до двух знаков после запятой
  formattedNumber = Math.round(formattedNumber * 100) / 100;

  return formattedNumber;
}

export const update_pump = (
  symbol: string,
  period: number,
  price_change: number,
  lastPrice: number,
  nowPrice: number,
  signals_count: number,
  type: "recession" | "growth",
  from: ExchangeType,
  lang: "ru" | "en" = "en"
): string => {
  let message: string = "";
  message += from === "BINANCE" ? "💎 <b>Binance</b> 💎\n\n" : "💵 <b>ByBit</b> 💵\n\n";
  message += `🔵 <b>${type === "growth" ? "🛫 PUMP" : "🔻 DUMP"}</b> — <i>${period}${lang === "ru" ? "м" : "m"}</i> — <b>#${symbol}</b> 🔵\n`;
  message += `<b>${type === "growth" ? "📈" : "📉"} ${lang === "ru" ? "Цена" : "Price"}: ${
    type === "growth" ? `+${price_change}` : `-${price_change}`
  }% (${lastPrice}-${nowPrice})</b>\n`;

  message += `❗️ ${lang === "ru" ? "Сигналов за сутки" : "Signals today"}: ${signals_count}\n\n`;

  message += from !== "BINANCE" ? `<a href="https://www.bybit.com/trade/usdt/${symbol}">Bybit</a> | ` : "";
  message += from !== "BYBIT" ? `<a href="https://www.binance.com/en/futures/${symbol}">Binance</a> | ` : "";
  message += `<a href="https://www.coinglass.com/en/currencies/ByBit_${symbol}">Coinglass</a>`;

  return message;
};

export const update_rekt = (
  symbol: string,
  price: number,
  side: "Sell" | "Buy" | "SELL" | "BUY",
  signals_count: number,
  from: ExchangeType,
  lang: "ru" | "en" = "en"
): string => {
  let message: string = "";
  message += from === "BINANCE" ? "💎 <b>Binance</b> 💎\n\n" : "💵 <b>ByBit</b> 💵\n\n";
  message += `<b>${side === "Sell" || side === "SELL" ? `🔴 #${symbol}` : `🟢 #${symbol}`} rekt `;
  message += `${side === "Sell" || side === "SELL" ? `Short` : `Long`}: $${price}</b>\n`;

  message += `❗️ ${lang === "ru" ? "Сигналов за сутки" : "Signals today"}: ${signals_count}\n\n`;

  message +=
    from !== "BINANCE"
      ? `<a href="https://www.bybit.com/en/trade/spot/${symbol.replace("USDT", "")}/USDT">Bybit</a> | `
      : "";
  message += `<a href="https://www.binance.com/en/futures/${symbol}">Binance</a> | `;
  message += `<a href="https://www.coinglass.com/en/currencies/ByBit_${symbol}">Coinglass</a>`;

  return message;
};
