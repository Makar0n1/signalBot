import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export type ExchangeType = ["bybit"] | ["binance"] | ["binance", "bybit"];

export type Exchange = "bybit" | "binance";

export interface IConfig extends Document {
  _id: string;
  created: Date;
  exchange: ExchangeType;
  oi_growth_period: number;
  oi_recession_period: number;
  oi_growth_percentage: number;
  oi_recession_percentage: number;

  pump_growth_period: number;
  pump_recession_period: number;
  pump_growth_percentage: number;
  pump_recession_percentage: number;

  rekt_limit: number;

  user: IUser;
}

export const ConfigSchema = new mongoose.Schema({
  created: { type: Date, default: Date.now },
  exchange: {
    type: [String],
    enum: ["bybit", "binance"],
    required: true,
  },
  oi_growth_period: { type: Number, required: true },
  oi_recession_period: { type: Number, required: true },
  oi_growth_percentage: { type: Number, required: true },
  oi_recession_percentage: { type: Number, required: true },
  pump_growth_period: { type: Number, required: true },
  pump_recession_period: { type: Number, required: true },
  pump_growth_percentage: { type: Number, required: true },
  pump_recession_percentage: { type: Number, required: true },
  rekt_limit: { type: Number, required: true },

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Индексы для оптимизации запросов
ConfigSchema.index({ user: 1 });                    // Быстрый поиск конфига по пользователю
ConfigSchema.index({ exchange: 1 });                // Фильтрация по биржам
ConfigSchema.index({ user: 1, exchange: 1 });       // Составной индекс для populate с match

// Создание модели Config
const Config = mongoose.model<IConfig>("Config", ConfigSchema);
export default Config;
