import mongoose, { Document } from "mongoose";
import { IUser } from "./User";

export interface IByBit_OI extends Document {
  _id: string;
  symbol: string;
  last_update_growth: Date;
  last_update_recession: Date;
  openInterestValueGrowth: number;
  openInterestValueRecession: number;
  priceGrowth: number;
  priceRecession: number;
  h24_signal_count_recession: number;
  h24_signal_count_growth: number;

  user: IUser;
}

export const ByBit_OI_Schema = new mongoose.Schema({
  symbol: { type: String },
  last_update_growth: { type: Date, default: Date.now },
  last_update_recession: { type: Date, default: Date.now },
  openInterestValueGrowth: Number,
  openInterestValueRecession: Number,
  priceGrowth: Number,
  priceRecession: Number,
  h24_signal_count_recession: Number,
  h24_signal_count_growth: Number,

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Добавляем составной индекс для symbol и user
ByBit_OI_Schema.index({ symbol: 1, user: 1 }, { unique: true });

const ByBit_OI = mongoose.model<IByBit_OI>("ByBit_OI", ByBit_OI_Schema);
export default ByBit_OI;
