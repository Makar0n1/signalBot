import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export interface IByBit_REKT extends Document {
  _id: string;
  symbol: string;

  h24_signal_count_liq: number;

  user: IUser["_id"];
}

export const ByBit_REKT_Shema = new mongoose.Schema({
  symbol: { type: String },
  h24_signal_count_liq: Number,

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Добавляем составной индекс для symbol и user
ByBit_REKT_Shema.index({ symbol: 1, user: 1 }, { unique: true });

const ByBit_REKT = mongoose.model<IByBit_REKT>("ByBit_REKT", ByBit_REKT_Shema);
export default ByBit_REKT;
