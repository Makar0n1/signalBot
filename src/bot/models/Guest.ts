import mongoose, { Document } from "mongoose";

import Config, { IConfig } from "./Config";
import logger from "../utils/logger";

export interface IGuest extends Document {
  _id: string;
  user_id: Number;
  username?: string;
  language_code?: string;
}

export const GuestSchema = new mongoose.Schema({
  user_id: { type: Number, required: true, unique: true },
  username: { type: String },
  language_code: { type: String },
});

const Guest = mongoose.model<IGuest>("Guest", GuestSchema);
export default Guest;
