import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export interface IBinance_OI extends Document {
  _id: string;
  symbol: string;
  last_update_growth: Date;
  last_update_recession: Date;
  openInterestValueGrowth: number;
  openInterestValueRecession: number;
  lastPriceGrowth: number;
  lastPriceRecession: number;
  h24_signal_count_recession: number;
  h24_signal_count_growth: number;

  user: IUser["_id"];
}

export const Binance_OI_Schema = new mongoose.Schema({
  symbol: { type: String },
  last_update_growth: { type: Date, default: Date.now },
  last_update_recession: { type: Date, default: Date.now },
  openInterestValueGrowth: Number,
  openInterestValueRecession: Number,
  lastPriceGrowth: Number,
  lastPriceRecession: Number,
  h24_signal_count_recession: Number,
  h24_signal_count_growth: Number,

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Добавляем составной индекс для symbol и user
Binance_OI_Schema.index({ symbol: 1, user: 1 }, { unique: true });
// Дополнительные индексы для оптимизации
Binance_OI_Schema.index({ user: 1 });                                    // Для populate и удаления записей пользователя
Binance_OI_Schema.index({ h24_signal_count_growth: 1 });                 // Для clearTickersCounts
Binance_OI_Schema.index({ h24_signal_count_recession: 1 });              // Для clearTickersCounts

const Binance_OI = mongoose.model<IBinance_OI>("Binance_OI", Binance_OI_Schema);
export default Binance_OI;
