import mongoose, { Document } from "mongoose";

export interface IAdmin extends Document {
  _id: string;
  user_id: Number;
  isSuperAdmin: boolean;
}

export const AdminSchema = new mongoose.Schema({
  user_id: { type: Number, required: true, unique: true },
  isSuperAdmin: { type: Boolean, default: false },
});

const Admin = mongoose.model<IAdmin>("Admin", AdminSchema);
export default Admin;
