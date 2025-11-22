import { Markup } from "telegraf";
import { t, Language } from "../utils/i18n";

const getREKTKeyboard = (lang: Language = "en") => {
  const rektKeyboard = Markup.keyboard([
    [t("keyboard.rekt.set_limit", lang)],
    [t("keyboard.back", lang)]
  ]).resize();

  return { rektKeyboard };
};

export default getREKTKeyboard;
