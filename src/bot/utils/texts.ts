import { IConfig } from "../models/Config";
import { Language, t } from "./i18n";

export const getMainPumpText = (config: IConfig, lang: Language = "en"): string => {
  const min = t("screener.min", lang);
  return `${t("screener.pump.title", lang)}\n\n${t("screener.pump.settings", lang)}\n${t("screener.pump.growth_period", lang)} ${config.pump_growth_period} ${min}\n${t("screener.pump.growth_percent", lang)} ${config.pump_growth_percentage}%\n\n${t("screener.pump.decline_period", lang)} ${config.pump_recession_period} ${min}\n${t("screener.pump.decline_percent", lang)} ${config.pump_recession_percentage}%`;
};

export const getMainOIText = (config: IConfig, lang: Language = "en"): string => {
  const min = t("screener.min", lang);
  return `${t("screener.oi.title", lang)}\n\n ${t("screener.oi.settings", lang)}\n${t("screener.oi.growth_period", lang)} ${config.oi_growth_period} ${min}\n${t("screener.oi.growth_percent", lang)} ${config.oi_growth_percentage}%\n\n${t("screener.oi.decline_period", lang)} ${config.oi_recession_period} ${min}\n${t("screener.oi.decline_percent", lang)} ${config.oi_recession_percentage}%`;
};


export const getMainREKTText = (config: IConfig, lang: Language = "en"): string => {
  return `${t("screener.rekt.title", lang)}\n\n${t("screener.rekt.settings", lang)}\n${t("screener.rekt.limit", lang)} ${config.rekt_limit}`;
};
