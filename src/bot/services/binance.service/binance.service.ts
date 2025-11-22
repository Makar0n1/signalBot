import { Context } from "telegraf";
import BinanceApi, { Binance, ForceOrder, Ticker } from "binance-api-node";
import moment from "moment-timezone";
import { differenceInMilliseconds } from "date-fns";

import { Binance_OI, Binance_PUMP, Binance_REKT } from "../../models";
import UserService from "./../user.service";
import { update_pump, update_rekt } from "../../utils/messages";
import { getPumpChange, getUpdateTimePUMP } from "./utils";
import logger from "../../utils/logger";
import telegramQueueService from "../telegram-queue.service";

class BinanceService {
  private Bot: Context;
  private client: Binance;

  constructor(bot: Context) {
    this.Bot = bot;
    this.client = BinanceApi.default();

    this.init();
  }

  async init() {
    const tasks = [
      this.subscribeAllTickers().catch((error) => {
        logger.error(undefined, "Ошибка при подписке на все тикеры", error);
      }),
      this.subscribeFuturesAllLiquidations().catch((error) => {
        logger.error(undefined, "Ошибка при подписке на ликвидации", error);
      }),
      this.signalCheckAndClear().catch((error) => {
        logger.error(undefined, "Ошибка при проверке времени и сбросе", error);
      }),
    ];

    await Promise.all(tasks);
  }

  // Подписка на все тикеры
  private async subscribeAllTickers() {
    const tickerQueue: Ticker[] = []; // Очередь данных
    const uniqueSymbols = new Set<string>(); // Множество для уникальных символов тикеров
    let isProcessing = false;
    let isProcessingCreate = false;

    // Функция обработки очереди тикеров
    const processTickerQueue = async () => {
      if (isProcessing) {
        return;
      }
      isProcessing = true;

      // Копируем текущую очередь для безопасной обработки
      const tickersToProcess = [...tickerQueue];
      tickerQueue.length = 0; // Очищаем очередь после копирования
      uniqueSymbols.clear(); // Очищаем множество уникальных символов

      if (tickersToProcess.length > 0) {
        try {
          await this.measureExecutionTime(
            "onTickerUpdatePUMPBinance",
            () => this.onTickerUpdatePUMP(tickersToProcess),
            ` , тикеров в последней очереди: ${tickersToProcess.length}`
          );
        } catch (error) {
          logger.error(undefined, "Ошибка при обработке тикеров", error);
        }
      }

      isProcessing = false;

      // Если новые тикеры появляются, запускаем процесс снова
      if (tickerQueue.length > 0) {
        setTimeout(processTickerQueue, 100);
      }
    };

    const createNew = async () => {
      if (isProcessingCreate) {
        return;
      }
      const tickersToProcess = [...tickerQueue];
      isProcessingCreate = true;
      if (tickersToProcess.length > 0) {
        try {
          await this.measureExecutionTime(
            "checkTickersExist",
            () => this.checkTickersExist(tickerQueue),
            ` , тикеров в последней очереди: ${tickersToProcess.length}`
          );
        } catch (error) {
          logger.error(undefined, "Ошибка при проверке тикеров", error);
        }
      }
      isProcessingCreate = false;

      // Если новые тикеры появляются, запускаем процесс снова
      if (tickerQueue.length > 0) {
        setTimeout(processTickerQueue, 1000);
      }
    };

    // Подписка на все тикеры
    this.client.ws.futuresAllTickers((tickers) => {
      tickers.forEach((ticker) => {
        if (ticker.symbol.endsWith("USDT") && !uniqueSymbols.has(ticker.symbol)) {
          uniqueSymbols.add(ticker.symbol);
          tickerQueue.push(ticker);
        }
      });

      // Если очередь не обрабатывается, запускаем обработку
      if (!isProcessing) {
        setTimeout(processTickerQueue, 100);
      }

      // Если очередь не обрабатывается, запускаем обработку
      if (!isProcessingCreate) {
        setTimeout(createNew, 1000);
      }
    });
  }

  private async measureExecutionTime(taskName: string, task: () => Promise<void>, text?: string) {
    const startTime = Date.now();
    try {
      await task();
    } catch (error) {
      logger.error(undefined, `Ошибка при выполнении ${taskName}`, error);
    } finally {
      const endTime = Date.now();
      const duration = endTime - startTime;
      logger.debug(undefined, `${taskName} выполнен за ${duration} мс${text || ""}`);
    }
  }

  // Все фьючерсные леквидации
  private async subscribeFuturesAllLiquidations() {
    this.client.ws.futuresAllLiquidations(async (liquidation) => {
      if (!liquidation.symbol.endsWith("USDT")) {
        return;
      }

      await Promise.all([
        this.checkLiquidationExist(liquidation).catch((error) =>
          logger.error(undefined, `Ошибка при проверке, существует ли у ликвидация в binance_rekt`, error)
        ),
        this.onTickerUpdateREKT(liquidation),
      ]);
    });
  }

  // Обработчик Pupm
  private async onTickerUpdatePUMP(tickers: Ticker[]) {
    const symbols = [...new Set(tickers.map((ticker) => ticker.symbol))];
    const pumpRecords = await this.getPumpRecords(symbols);
    const recordsBySymbol = this.groupRecordsBySymbol(pumpRecords);

    const dataUpdate = this.processTickers(tickers, recordsBySymbol);

    await this.bulkUpdatePumpRecords(dataUpdate);
  }

  private async getPumpRecords(symbols: string[]) {
    return await Binance_PUMP.find({ symbol: { $in: symbols } })
      .populate({
        path: "user",
        select: "user_id is_admin subscription_active subscription_expires_at trial_expires_at preferred_language is_banned",
        populate: {
          path: "config",
          select: "exchange pump_growth_period pump_recession_period pump_growth_percentage pump_recession_percentage",
          match: { exchange: { $in: ["binance"] } },
        },
      })
      .lean() // Возвращает plain JS objects вместо Mongoose documents - быстрее
      .then((records) => records.filter((record) => record.user && record.user.config));
  }

  private groupRecordsBySymbol(pumpRecords: any[]) {
    const recordsBySymbol: { [key: string]: any[] } = {};
    for (const record of pumpRecords) {
      if (!recordsBySymbol[record.symbol]) {
        recordsBySymbol[record.symbol] = [];
      }
      recordsBySymbol[record.symbol].push(record);
    }
    return recordsBySymbol;
  }

  private processTickers(tickers: Ticker[], recordsBySymbol: { [key: string]: any[] }) {
    const dataUpdate: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] = [];

    for (const ticker of tickers) {
      const pump_records = recordsBySymbol[ticker.symbol];
      if (!pump_records) continue;

      // Группируем записи по настройкам (period + percentage)
      // Пользователи с одинаковыми настройками должны получать одинаковые сигналы
      const groupedBySettings = this.groupPumpRecordsBySettings(pump_records);

      for (const group of Object.values(groupedBySettings)) {
        const referenceRecord = group[0];
        const result = this.processPumpRecordGroup(ticker, referenceRecord, group);

        if (result) {
          dataUpdate.push(...result.updates);
        }
      }
    }

    return dataUpdate;
  }

  // Группировка записей по настройкам PUMP
  private groupPumpRecordsBySettings(records: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};

    for (const record of records) {
      const config = record.user.config;
      const key = `${config.pump_growth_period}_${config.pump_recession_period}_${config.pump_growth_percentage}_${config.pump_recession_percentage}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(record);
    }

    return groups;
  }

  // Обработка группы записей с одинаковыми настройками
  private processPumpRecordGroup(
    ticker: Ticker,
    referenceRecord: any,
    group: any[]
  ): { updates: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] } | null {
    const { updateTimeGrowth, updateTimeRecession } = getUpdateTimePUMP(referenceRecord, referenceRecord.user.config);
    const now = new Date();
    const updates: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] = [];

    const isTimeToResetGrowth = updateTimeGrowth.getTime() <= now.getTime();
    const isTimeToResetRecession = updateTimeRecession.getTime() <= now.getTime();

    // Если время сброса - обновляем точку отсчёта для ВСЕХ в группе
    if (isTimeToResetGrowth || isTimeToResetRecession) {
      for (const record of group) {
        const data: { [key: string]: any } = {};
        if (isTimeToResetGrowth) {
          data.priceGrowth = Number(ticker.curDayClose);
          data.last_update_growth = now;
        }
        if (isTimeToResetRecession) {
          data.priceRecession = Number(ticker.curDayClose);
          data.last_update_recession = now;
        }
        updates.push({
          filter: { symbol: ticker.symbol, user: record.user._id },
          data,
        });
      }
      return { updates };
    }

    // Рассчитываем изменение от эталонной записи
    const { pump_change_recession, pump_change_growth } = getPumpChange(ticker, referenceRecord);
    const config = referenceRecord.user.config;

    const shouldSignalGrowth = pump_change_growth >= config.pump_growth_percentage;
    const shouldSignalRecession = pump_change_recession < 0 && Math.abs(pump_change_recession) >= config.pump_recession_percentage;

    if (shouldSignalGrowth) {
      // Отправляем сигнал ВСЕМ пользователям в группе и обновляем ВСЕ записи
      for (const record of group) {
        this.sendPumpSignal(ticker, record, pump_change_growth, "growth");
        updates.push({
          filter: { symbol: ticker.symbol, user: record.user._id },
          data: {
            priceGrowth: Number(ticker.curDayClose),
            last_update_growth: now,
            h24_signal_count_growth: record.h24_signal_count_growth + 1,
          },
        });
      }
    } else if (shouldSignalRecession) {
      // Отправляем сигнал ВСЕМ пользователям в группе и обновляем ВСЕ записи
      for (const record of group) {
        this.sendPumpSignal(ticker, record, Math.abs(pump_change_recession), "recession");
        updates.push({
          filter: { symbol: ticker.symbol, user: record.user._id },
          data: {
            priceRecession: Number(ticker.curDayClose),
            last_update_recession: now,
            h24_signal_count_recession: record.h24_signal_count_recession + 1,
          },
        });
      }
    }

    return updates.length > 0 ? { updates } : null;
  }

  private async sendPumpSignal(ticker: Ticker, pump_record: any, pump_change: number, type: "growth" | "recession") {
    // Check if user has active subscription or trial
    const now = new Date();
    const user = pump_record.user;

    // Skip if user is banned
    if (user.is_banned) {
      return;
    }

    // Check subscription/trial access
    const hasActiveSubscription = user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now;
    const hasActiveTrial = user.trial_expires_at && user.trial_expires_at > now;
    const isAdmin = user.is_admin;

    // Only send signals if user has access
    if (!isAdmin && !hasActiveSubscription && !hasActiveTrial) {
      logger.debug(
        undefined,
        `Skipping signal for user ${pump_record.user.user_id} - no active subscription or trial`
      );
      return;
    }

    const signals_count =
      type === "growth" ? pump_record.h24_signal_count_growth + 1 : pump_record.h24_signal_count_recession + 1;
    const period =
      type === "growth" ? pump_record.user.config.pump_growth_period : pump_record.user.config.pump_recession_period;
    const price = type === "growth" ? pump_record.priceGrowth : pump_record.priceRecession;

    // Get user's preferred language
    const userLang = pump_record.user.preferred_language || "en";

    // Используем очередь для rate-limited отправки сообщений
    telegramQueueService.send(
      String(pump_record.user.user_id),
      update_pump(
        ticker.symbol,
        period,
        pump_change,
        price,
        Number(ticker.curDayClose),
        signals_count,
        type,
        "BINANCE",
        userLang
      )
    ).catch((err) => {
      logger.error(undefined, `Failed to queue PUMP message for user ${pump_record.user.user_id}: ${err.message}`);
    });
  }

  private async bulkUpdatePumpRecords(
    dataUpdate: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[]
  ) {
    const bulkOperations = dataUpdate.map((update) => ({
      updateOne: {
        filter: update.filter,
        update: { $set: update.data },
      },
    }));

    await Binance_PUMP.bulkWrite(bulkOperations)
      .then((res) => {
        logger.debug(
          undefined,
          `Bulk write operation completed successfully: Inserted Count: ${res.insertedCount}, Matched Count: ${
            res.matchedCount
          }, Modified Count: ${res.modifiedCount}, Deleted Count: ${res.deletedCount}, Upserted Count: ${
            res.upsertedCount
          }, Upserted IDs: ${JSON.stringify(res.upsertedIds)}, Inserted IDs: ${JSON.stringify(res.insertedIds)}`
        );
      })
      .catch((error) => {
        logger.error(undefined, "Bulk write operation failed", error);
      });
  }

  // Обработчик REKT
  private async onTickerUpdateREKT(liquidation: ForceOrder): Promise<void> {
    const rect_records = await Binance_REKT.find({ symbol: liquidation.symbol })
      .populate({
        path: "user",
        select: "user_id is_admin subscription_active subscription_expires_at trial_expires_at preferred_language is_banned",
        populate: {
          path: "config",
          select: "rekt_limit exchange",
          match: { exchange: { $in: ["binance"] } },
        },
      })
      .lean() // Возвращает plain JS objects - быстрее
      .then((records) => records.filter((record) => record.user && record.user.config));

    for (const rect_record of rect_records) {
      if (!rect_record.user?.config) {
        continue;
      }

      // Check if user has active subscription or trial
      const now = new Date();
      const user = rect_record.user;

      // Skip if user is banned
      if (user.is_banned) {
        continue;
      }

      // Check subscription/trial access
      const hasActiveSubscription = user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now;
      const hasActiveTrial = user.trial_expires_at && user.trial_expires_at > now;
      const isAdmin = user.is_admin;

      // Only send signals if user has access
      if (!isAdmin && !hasActiveSubscription && !hasActiveTrial) {
        logger.debug(
          undefined,
          `Skipping REKT signal for user ${rect_record.user.user_id} - no active subscription or trial`
        );
        continue;
      }

      if (Number(liquidation.price) >= rect_record.user.config.rekt_limit) {
        const signals_count = rect_record.h24_signal_count_liq + 1;

        // Get user's preferred language
        const userLang = rect_record.user.preferred_language || "en";

        // Используем очередь с высоким приоритетом для REKT сигналов (ликвидации критичны)
        telegramQueueService.sendHighPriority(
          String(rect_record.user.user_id),
          update_rekt(liquidation.symbol, Number(liquidation.price), liquidation.side, signals_count, "BINANCE", userLang)
        ).catch((err) => {
          logger.error(undefined, `Failed to queue REKT message for user ${rect_record.user.user_id}: ${err.message}`);
        });

        await Binance_REKT.updateOne(
          { symbol: liquidation.symbol, user: rect_record.user._id },
          {
            h24_signal_count_liq: signals_count,
          }
        );
      }
    }
  }

  // Проверяет, существует ли данный тикер в базе у игрока, если нет - то добавляет его в базу
  // Оптимизировано: batch upsert вместо последовательных запросов
  private async checkTickersExist(tickers: Ticker[]) {
    const symbols = [...new Set(tickers.map((t) => t.symbol))];
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    // Получаем всех пользователей у которых нет хотя бы одного из символов
    const usersWithoutRecords = await UserService.getBinancePumpRecordsForUsersWithoutSymbols(symbols);

    if (!usersWithoutRecords || usersWithoutRecords.length === 0) {
      return;
    }

    // Собираем все bulk операции
    const bulkOps = [];
    for (const { user, missingSymbols } of usersWithoutRecords) {
      for (const symbol of missingSymbols) {
        const ticker = tickerMap.get(symbol);
        if (!ticker) continue;

        bulkOps.push({
          updateOne: {
            filter: { symbol, user: user._id },
            update: {
              $setOnInsert: {
                last_update_growth: new Date(),
                last_update_recession: new Date(),
                priceGrowth: Number(ticker.curDayClose),
                priceRecession: Number(ticker.curDayClose),
                h24_signal_count_recession: 0,
                h24_signal_count_growth: 0,
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await Binance_PUMP.bulkWrite(bulkOps, { ordered: false });
      logger.debug(undefined, `Batch upsert: ${bulkOps.length} записей binance_pumps`);
    }
  }

  // Проверяет, существует ли данный ликвидация в базе у игрока, если нет - то добавляет его в базу
  private async checkLiquidationExist(liquidation: ForceOrder) {
    const usersWithoutBinanceRecords = await UserService.getBinanceRektRecordsForUsersWithoutSymbol(liquidation.symbol);
    if (!usersWithoutBinanceRecords) {
      return;
    }

    for (const user of usersWithoutBinanceRecords) {
      const filter = { symbol: liquidation.symbol, user: user._id };
      const update = {
        $setOnInsert: {
          symbol: liquidation.symbol,

          h24_signal_count_liq: 0,
        },
      };

      await Binance_REKT.updateOne(filter, update, { upsert: true });
      logger.debug(
        undefined,
        `Для пользователя с tg-id ${user.user_id} создана запись binance_rekt с ${liquidation.symbol}`
      );
    }
  }

  // Проверяет время, если уже следующий день, то сбрасывает кол-во сигналов у всех тикеров
  private async signalCheckAndClear() {
    let diff: number;

    const updateTime = () => {
      const now = new Date();
      const moscowTime = moment.tz(now, "Europe/Moscow").toDate(); // опредляем текущее время в Москве

      let midnight = moment
        .tz("Europe/Moscow")
        .set({
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0,
        })
        .toDate();

      // Если текущее время уже прошло 00:00 сегодня, выбираем завтрашнее время 00:00
      if (moscowTime > midnight) {
        midnight = moment(midnight).add(1, "day").toDate();
      }

      diff = differenceInMilliseconds(midnight, moscowTime);
      logger.debug(undefined, "update time", { diff });
    };

    // Для выполнения функции обновления времени и запуска сигнала:
    const executeAfterDelay = () => {
      updateTime();
      setTimeout(() => {
        this.clearTickersCounts();
        logger.debug(undefined, "00:00 - Чистота сигналов раз в сутки", diff);
        executeAfterDelay();
      }, diff);
    };

    executeAfterDelay();
  }

  // Сбрасывает у всех тикиров кол-во в день
  // Оптимизировано: обновляем только записи где счётчик > 0 (используются индексы), параллельно
  public async clearTickersCounts() {
    await Promise.all([
      Binance_OI.updateMany(
        { $or: [{ h24_signal_count_growth: { $gt: 0 } }, { h24_signal_count_recession: { $gt: 0 } }] },
        { h24_signal_count_growth: 0, h24_signal_count_recession: 0 }
      ),
      Binance_PUMP.updateMany(
        { $or: [{ h24_signal_count_growth: { $gt: 0 } }, { h24_signal_count_recession: { $gt: 0 } }] },
        { h24_signal_count_growth: 0, h24_signal_count_recession: 0 }
      ),
      Binance_REKT.updateMany(
        { h24_signal_count_liq: { $gt: 0 } },
        { h24_signal_count_liq: 0 }
      ),
    ]);
  }

  static getService(bot: Context) {
    return new BinanceService(bot);
  }
}

export default BinanceService;
