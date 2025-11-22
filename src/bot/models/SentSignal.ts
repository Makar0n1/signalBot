import mongoose, { Schema, Document } from "mongoose";

export interface ISentSignal extends Document {
  user_id: number;
  message_id: number;
  chat_id: number;
  sent_at: Date;
}

const SentSignalSchema = new Schema<ISentSignal>({
  user_id: { type: Number, required: true, index: true },
  message_id: { type: Number, required: true },
  chat_id: { type: Number, required: true },
  sent_at: { type: Date, default: Date.now, index: true },
});

// TTL index to automatically remove documents older than 25 hours (as backup)
SentSignalSchema.index({ sent_at: 1 }, { expireAfterSeconds: 25 * 60 * 60 });

// Compound index for efficient cleanup queries
SentSignalSchema.index({ sent_at: 1, user_id: 1 });

const SentSignal = mongoose.model<ISentSignal>("SentSignal", SentSignalSchema);
export default SentSignal;
