import { Markup } from "telegraf";
import { t, Language } from "../utils/i18n";

const getMainKeyboard = (lang: Language = "en") => {
  const mainKeyboard = Markup.keyboard([
    [t("keyboard.oi", lang), t("keyboard.pump", lang), t("keyboard.rekt", lang)],
    [t("keyboard.exchange", lang), t("keyboard.subscription", lang)],
    [t("keyboard.language", lang)]
  ]).resize();

  return { mainKeyboard };
};

export const getCancelKeyboard = (lang: Language = "en") => {
  const cancelKeyboard = Markup.keyboard([
    [t("keyboard.cancel", lang)]
  ]).resize();

  return { cancelKeyboard };
};

export default getMainKeyboard;
