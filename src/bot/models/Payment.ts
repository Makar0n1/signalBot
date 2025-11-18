import mongoose, { Document } from "mongoose";

export interface IPayment extends Document {
  _id: string;
  user_id: number;
  payment_id: string; // NOWPayments payment ID
  amount: number;
  currency: string;
  status: 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'partially_paid' | 'finished' | 'failed' | 'refunded' | 'expired';
  pay_address?: string;
  pay_amount?: number;
  pay_currency?: string;
  purchase_id?: string;
  order_id?: string;
  created_at: Date;
  updated_at: Date;
}

export const PaymentSchema = new mongoose.Schema({
  user_id: { type: Number, required: true, index: true },
  payment_id: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: {
    type: String,
    enum: ['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'],
    default: 'waiting'
  },
  pay_address: { type: String },
  pay_amount: { type: Number },
  pay_currency: { type: String },
  purchase_id: { type: String },
  order_id: { type: String },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
export default Payment;
