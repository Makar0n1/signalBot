import dotenv from "dotenv";
dotenv.config();

import { Context, Scenes, Telegraf, session } from "telegraf";
import mongoose from "mongoose";

import messageHandler from "./handlers/messageHandler.js";
import commandHandler from "./handlers/commandHandler.js";
import actionHandler from "./handlers/actionHandler.js";
import subscriptionHandler from "./handlers/subscriptionHandler.js";
import logger from "./utils/logger.js";
import { initializeTrial, checkSubscription } from "./middlewares/subscription.middleware.js";

import { SetOI } from "./controllers/SetOI/index.js";

import ByBitWebSocketApiService from "./services/api.service.js";

import ByBitServiceCl from "./services/bybit.service/bybit.service.js";
import UserService from "./services/user.service";
import BinanceServiceCl from "./services/binance.service/binance.service.js";
import { SetPUMP } from "./controllers/SetPUPM/index.js";
import { SetREKT } from "./controllers/SetREKT/index.js";
import { Admin } from "./models";
import subscriptionNotifier from "./services/subscription-notifier.service.js";
import paymentService from "./services/payment.service";
import telegramQueueService from "./services/telegram-queue.service.js";

const MONGODB_URI = process.env.MONGODB_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing from environment variables.");
}

let bot: any, ByBitService: ByBitServiceCl, BYBIT_API: ByBitWebSocketApiService, BinanceService: BinanceServiceCl;

export const createOrUpdateMainAdmin = async (user_id: string, isSuperAdmin: boolean = false) => {
  try {
    const admin = await Admin.findOne({ user_id });
    if (admin) {
      logger.debug(undefined, `Админ с user_id: ${user_id} уже существует`);
      await Admin.updateOne({ user_id }, { isSuperAdmin: true });
      logger.debug(undefined, `Данные суперАдмина с user_id: ${user_id} обновлены`);
    } else {
      await Admin.create({ user_id, isSuperAdmin });
      logger.debug(undefined, `Создан суперАдмин с user_id: ${user_id}`);
    }

    // Create or update user and mark as admin
    const { User } = await import("./models/index.js");
    const user = await User.findOne({ user_id: Number(user_id) });
    if (user) {
      user.is_admin = true;
      user.subscription_active = true; // Admin always has access
      await user.save();
      logger.debug(undefined, `Пользователь ${user_id} отмечен как админ`);
    } else {
      await UserService.createUser({ user_id: Number(user_id) });
      const newUser = await User.findOne({ user_id: Number(user_id) });
      if (newUser) {
        newUser.is_admin = true;
        newUser.subscription_active = true;
        await newUser.save();
        logger.debug(undefined, `Создан пользователь-админ ${user_id}`);
      }
    }
  } catch (err) {
    logger.error(undefined, "Ошибка при создании суперАдмина", err);
  }
};

// Оптимизированные настройки MongoDB для высокой нагрузки
const mongoOptions = {
  // Connection pool настройки
  maxPoolSize: 100,           // Максимум соединений (по умолчанию 10 - недостаточно для 1000+ пользователей)
  minPoolSize: 20,            // Минимум открытых соединений для быстрого отклика
  maxIdleTimeMS: 30000,       // Закрывать неактивные соединения через 30 сек

  // Таймауты
  socketTimeoutMS: 45000,             // Таймаут сокета (увеличен для длинных операций)
  serverSelectionTimeoutMS: 5000,     // Быстрый failover при недоступности сервера
  connectTimeoutMS: 10000,            // Таймаут подключения
  waitQueueTimeoutMS: 10000,          // Таймаут ожидания соединения из pool

  // Производительность
  family: 4,                  // Только IPv4 (быстрее чем dual-stack)
  retryWrites: true,          // Автоматический retry при временных сбоях
  retryReads: true,           // Автоматический retry чтения
};

mongoose
  .connect(MONGODB_URI, mongoOptions)
  .then(async () => {
    logger.debug(undefined, "Подключена бд");
    if (process.env.MAIN_ADMIN_TG_USER_ID) {
      await createOrUpdateMainAdmin(process.env.MAIN_ADMIN_TG_USER_ID, true);
    }
    // Инициализация бота
    bot = new Telegraf<Context>(BOT_TOKEN);
    // Инициализация сцены
    const stage = new Scenes.Stage([SetOI, SetPUMP, SetREKT]);
    bot.use(session());
    bot.use(stage.middleware());

    // Subscription middleware
    bot.use(initializeTrial);
    // Note: checkSubscription should be added selectively to specific handlers that need it

    // Хэндлеры
    messageHandler(bot);
    commandHandler(bot);
    actionHandler(bot);
    subscriptionHandler(bot);

    bot.catch((error: any) => {
      logger.error(undefined, "Global error has happened, %O", error);
    });

    logger.debug(undefined, "Бот запущен");

    BinanceService = BinanceServiceCl.getService(bot);
    ByBitService = ByBitServiceCl.getService(bot);

    // Initialize subscription notifier service
    subscriptionNotifier.initialize(bot);

    // Initialize payment service with bot instance
    paymentService.setBot(bot);

    // Initialize Telegram queue service for rate-limited message sending
    telegramQueueService.initialize(bot);

    // ByBitService = ByBitServiceCl.getByBitService(Trackable, bot);
    // BYBIT_API = ByBitWebSocketApiService.getWebsocketClient();

    // await ByBitService.onStartApp();
    // await ByBitService.signalCheckAndClear();

    // Запуск бота
    await bot.launch({
      allowedUpdates: ["message", "callback_query"],
    });

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  })
  .catch((err) => {
    logger.error(undefined, "Error occurred during an attempt to establish connection with the database: %O", err);
    process.exit(1);
  });

// Обработка ошибок MongoDB с graceful recovery
mongoose.connection.on("error", (err) => {
  logger.error(undefined, "MongoDB connection error: %O", err);
  // Не падаем при временных ошибках - mongoose автоматически переподключится
});

mongoose.connection.on("disconnected", () => {
  logger.warn(undefined, "MongoDB disconnected. Attempting to reconnect...");
});

mongoose.connection.on("reconnected", () => {
  logger.info(undefined, "MongoDB reconnected successfully");
});

export { ByBitService, BYBIT_API };
export default bot;
