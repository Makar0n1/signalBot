import { Markup } from "telegraf";
import { MAIN_ROUTES } from "../utils/CONST";

const getMainKeyboard = () => {
  const mainKeyboard = Markup.keyboard([
    [MAIN_ROUTES.OI, MAIN_ROUTES.PUMP, MAIN_ROUTES.REKT],
    [MAIN_ROUTES.Exchange, MAIN_ROUTES.Subscription]
  ]).resize();

  return { mainKeyboard };
};

export default getMainKeyboard;
