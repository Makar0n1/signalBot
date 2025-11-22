import { Markup } from "telegraf";
import { t, Language } from "../utils/i18n";

const getOIKeyboard = (lang: Language = "en") => {
  const oiKeyboard = Markup.keyboard([
    [t("keyboard.oi.up_period", lang), t("keyboard.oi.up_percent", lang)],
    [t("keyboard.oi.down_period", lang), t("keyboard.oi.down_percent", lang)],
    [t("keyboard.back", lang)]
  ]).resize();

  return { oiKeyboard };
};

export default getOIKeyboard;
