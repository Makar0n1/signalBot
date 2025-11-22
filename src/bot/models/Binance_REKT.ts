import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export interface IBinance_REKT extends Document {
  _id: string;
  symbol: string;

  h24_signal_count_liq: number;

  user: IUser;
}

export const Binance_REKT_Shema = new mongoose.Schema({
  symbol: { type: String },
  h24_signal_count_liq: Number,

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Добавляем составной индекс для symbol и user
Binance_REKT_Shema.index({ symbol: 1, user: 1 }, { unique: true });
// Дополнительные индексы для оптимизации
Binance_REKT_Shema.index({ user: 1 });                                   // Для populate и удаления записей пользователя
Binance_REKT_Shema.index({ h24_signal_count_liq: 1 });                   // Для clearTickersCounts

const Binance_REKT = mongoose.model<IBinance_REKT>("Binance_REKT", Binance_REKT_Shema);
export default Binance_REKT;
