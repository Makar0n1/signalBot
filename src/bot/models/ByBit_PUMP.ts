import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export interface IByBit_PUMP extends Document {
  _id: string;
  symbol: string;
  last_update_growth: Date;
  last_update_recession: Date;
  priceGrowth: number;
  priceRecession: number;

  h24_signal_count_recession: number;
  h24_signal_count_growth: number;

  user: IUser;
}

export const ByBit_PUMP_Schema = new mongoose.Schema({
  symbol: { type: String },
  last_update_growth: { type: Date, default: Date.now },
  last_update_recession: { type: Date, default: Date.now },
  priceGrowth: Number,
  priceRecession: Number,
  h24_signal_count_recession: Number,
  h24_signal_count_growth: Number,

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Добавляем составной индекс для symbol и user
ByBit_PUMP_Schema.index({ symbol: 1, user: 1 }, { unique: true });
// Дополнительные индексы для оптимизации
ByBit_PUMP_Schema.index({ user: 1 });                                    // Для populate и удаления записей пользователя
ByBit_PUMP_Schema.index({ h24_signal_count_growth: 1 });                 // Для clearTickersCounts
ByBit_PUMP_Schema.index({ h24_signal_count_recession: 1 });              // Для clearTickersCounts

const ByBit_PUMP = mongoose.model<IByBit_PUMP>("ByBit_PUMP", ByBit_PUMP_Schema);
export default ByBit_PUMP;
