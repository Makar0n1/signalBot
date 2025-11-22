import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export interface IByBit_REKT extends Document {
  _id: string;
  symbol: string;

  h24_signal_count_liq: number;

  user: IUser["_id"];
}

export const ByBit_REKT_Schema = new mongoose.Schema({
  symbol: { type: String },
  h24_signal_count_liq: Number,

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Добавляем составной индекс для symbol и user
ByBit_REKT_Schema.index({ symbol: 1, user: 1 }, { unique: true });
// Дополнительные индексы для оптимизации
ByBit_REKT_Schema.index({ user: 1 });                                    // Для populate и удаления записей пользователя
ByBit_REKT_Schema.index({ h24_signal_count_liq: 1 });                    // Для clearTickersCounts

const ByBit_REKT = mongoose.model<IByBit_REKT>("ByBit_REKT", ByBit_REKT_Schema);
export default ByBit_REKT;
