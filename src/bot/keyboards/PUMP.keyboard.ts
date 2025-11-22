import { Markup } from "telegraf";
import { t, Language } from "../utils/i18n";

const getPUMPKeyboard = (lang: Language = "en") => {
  const pumpKeyboard = Markup.keyboard([
    [t("keyboard.pump.up_period", lang), t("keyboard.pump.up_percent", lang)],
    [t("keyboard.pump.down_period", lang), t("keyboard.pump.down_percent", lang)],
    [t("keyboard.back", lang)]
  ]).resize();

  return { pumpKeyboard };
};

export default getPUMPKeyboard;
