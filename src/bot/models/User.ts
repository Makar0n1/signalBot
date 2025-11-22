import mongoose, { Document } from "mongoose";

import { IByBit_PUMP } from "./ByBit_PUMP";
import { IByBit_OI } from "./ByBit_OI";
import { IByBit_REKT } from "./ByBit_REKT";
import Config, { IConfig } from "./Config";
import logger from "../utils/logger";

export interface IUser extends Document {
  _id: string;
  user_id: Number;
  username?: string;
  language_code?: string;
  preferred_language: "en" | "ru";

  bybit_pump: IByBit_PUMP[];
  bybit_oi: IByBit_OI[];
  bybit_rekt: IByBit_REKT[];
  config: IConfig;

  // Subscription fields
  trial_started_at?: Date;
  trial_expires_at?: Date;
  trial_expiry_notified?: boolean;
  subscription_active: boolean;
  subscription_expires_at?: Date;
  subscription_expiry_notified?: boolean;
  is_banned: boolean;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export const UserSchema = new mongoose.Schema({
  user_id: { type: Number, required: true, unique: true },
  username: { type: String },
  language_code: { type: String },
  preferred_language: { type: String, enum: ["en", "ru"], default: "en" },
  bybit_pump: [{ type: mongoose.Schema.Types.ObjectId, ref: "ByBit_PUMP" }],
  bybit_oi: [{ type: mongoose.Schema.Types.ObjectId, ref: "ByBit_OI" }],
  bybit_rekt: [{ type: mongoose.Schema.Types.ObjectId, ref: "ByBit_REKT" }],
  config: { type: mongoose.Schema.Types.ObjectId, ref: "Config" },

  // Subscription fields
  trial_started_at: { type: Date },
  trial_expires_at: { type: Date },
  trial_expiry_notified: { type: Boolean, default: false },
  subscription_active: { type: Boolean, default: false },
  subscription_expires_at: { type: Date },
  subscription_expiry_notified: { type: Boolean, default: false },
  is_banned: { type: Boolean, default: false },
  is_admin: { type: Boolean, default: false },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Индексы для оптимизации запросов
UserSchema.index({ subscription_expires_at: 1 });                           // Поиск истекающих подписок
UserSchema.index({ trial_expires_at: 1 });                                  // Поиск истекающих триалов
UserSchema.index({ is_admin: 1 });                                          // Фильтрация админов
UserSchema.index({ is_banned: 1 });                                         // Фильтрация заблокированных
UserSchema.index({ subscription_active: 1, subscription_expires_at: 1 });   // Активные подписки
UserSchema.index({ subscription_active: 1, is_admin: 1, trial_expires_at: 1 }); // Проверка доступа

UserSchema.post("save", async function (this: IUser) {
  try {
    if (!this.config) {
      const defaultConfig = {
        exchange: ["bybit", "binance"],
        oi_growth_period: 15,
        oi_recession_period: 15,
        oi_growth_percentage: 15,
        oi_recession_percentage: 15,
        pump_growth_period: 15,
        pump_recession_period: 15,
        pump_growth_percentage: 15,
        pump_recession_percentage: 15,
        rekt_limit: 10000,
        user: this._id,
      };

      const config = await Config.create(defaultConfig);
      logger.debug(undefined, `Создан конфиг для юзера: ${this.user_id}`);

      this.config = config._id;
      await this.save();
    } else {
      logger.debug(undefined, `Конфиг уже существует для юзера: ${this.user_id}`);
    }
  } catch (error) {
    logger.error(undefined, "Ошибка при создании конфига", error);
  }
});

// Добавьте этот код после определения схемы пользователя (UserSchema)

// Post-middleware для findOneAndDelete операции
UserSchema.post("findOneAndDelete", async function (doc: IUser) {
  if (doc) {
    try {
      // Удаляем связанные записи в ByBit_PUMP
      await mongoose.model("ByBit_PUMP").deleteMany({ user: { $in: doc._id } });
      await mongoose.model("Binance_PUMP").deleteMany({ user: { $in: doc._id } });

      // Удаляем связанные записи в ByBit_OI
      await mongoose.model("ByBit_OI").deleteMany({ user: { $in: doc._id } });
      await mongoose.model("Binance_OI").deleteMany({ user: { $in: doc._id } });

      // Удаляем связанные записи в ByBit_REKT
      await mongoose.model("ByBit_REKT").deleteMany({ user: { $in: doc._id } });
      await mongoose.model("Binance_REKT").deleteMany({ user: { $in: doc._id } });

      // Удаляем связанную запись в Config
      if (doc.config) {
        await mongoose.model("Config").deleteOne({ user: doc._id });
      }

      logger.debug(undefined, `Связанные данные удалены для пользователя user_id: ${doc.user_id}`);
    } catch (error) {
      logger.error(undefined, "Ошибка при удалении связанных данных:", error);
    }
  }
});

// // Колбэк перед удалением пользователя
// UserSchema.pre("findOneAndDelete", async function (this: IUser) {
//   const user = await this.model.findOne(this.getFilter());

//   if (user) {
//     try {
//       // Удаляем связанные записи в ByBit_PUMP
//       await mongoose.model("ByBit_PUMP").deleteMany({ _id: { $in: user.bybit_pump } });

//       // Удаляем связанные записи в ByBit_OI
//       await mongoose.model("ByBit_OI").deleteMany({ _id: { $in: user.bybit_oi } });

//       // Удаляем связанные записи в ByBit_REKT
//       await mongoose.model("ByBit_REKT").deleteMany({ _id: { $in: user.bybit_rekt } });

//       // Удаляем связанные записи в Config
//       await mongoose.model("Config").deleteMany({ _id: { $in: user.config } });

//       logger.debug(undefined, `Related data deleted for user`, this.username);
//     } catch (error) {
//       logger.debug(undefined, `Related data deleted for user`, this.username);
//       console.error(undefined, "Error deleting related data:", error);
//     }
//   }
// });

const User = mongoose.model<IUser>("User", UserSchema);
export default User;
