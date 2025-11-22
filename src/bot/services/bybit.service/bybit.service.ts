import { Context } from "telegraf";
import moment from "moment-timezone";
import { differenceInMilliseconds } from "date-fns";
import {
  CategoryV5,
  DefaultLogger,
  GetInstrumentsInfoParamsV5,
  LogParams,
  RestClientV5,
  WebsocketClient,
} from "bybit-api";

import { ByBit_OI, ByBit_PUMP, ByBit_REKT, IByBit_OI, IByBit_PUMP } from "../../models";
import UserService from "./../user.service";
import { getOpenInterestValueChange, getPumpChange, getUpdateTimeOI, getUpdateTimePUMP } from "./utils";
import logger from "../../utils/logger";
import { RESTCLIENTOPTIONS, WSCONFIG } from "../../utils/CONST";
import { update_oi, update_pump } from "../../utils/messages";
import { IByBitApiResponse, IByBitTickersWsRes } from "../api.service";
import telegramQueueService from "../telegram-queue.service";

const customLogger = {
  ...DefaultLogger,
  debug: (...params: LogParams) => logger.debug(undefined, `${JSON.stringify(params)}`),
  silly: (...params: LogParams) => logger.debug(undefined, `${JSON.stringify(params)}`),
  error: (...params: LogParams) => logger.error(undefined, `${JSON.stringify(params)}`),
  notice: (...params: LogParams) => logger.debug(undefined, `${JSON.stringify(params)}`),
  info: (...params: LogParams) => logger.debug(undefined, `${JSON.stringify(params)}`),
  warning: (...params: LogParams) => logger.error(undefined, `${JSON.stringify(params)}`),
};

class ByBitSevice {
  private Bot: Context;
  private webSocketClient: WebsocketClient;
  private restClientV5: RestClientV5;

  constructor(bot: Context) {
    this.webSocketClient = new WebsocketClient(WSCONFIG, customLogger);
    this.restClientV5 = new RestClientV5(RESTCLIENTOPTIONS);
    this.Bot = bot;

    this.init();
  }

  async init() {
    const tasks = [
      this.measureExecutionTime(
        "subscribeAllTickers",
        async () => await this.subscribeAllTickers({ category: "linear", status: "Trading" }, "linear")
      ),
      this.pumpCheckerProcess().catch((error) => {
        logger.error(undefined, "Ошибка при pumpCheckerProcess", error);
      }),

      this.pumpProcess().catch((error) => {
        logger.error(undefined, "Ошибка при pumpProcess", error);
      }),
      this.oiProcess().catch((error) => {
        logger.error(undefined, "Ошибка при oiProcess", error);
      }),
      this.oiCheckerProcess().catch((error) => {
        logger.error(undefined, "Ошибка при pumpCheckerProcess", error);
      }),
      // this.subscribeFuturesAllLiquidations().catch((error) => {
      //   logger.error(undefined, "Ошибка при подписке на ликвидации", error);
      // }),
      this.signalCheckAndClear().catch((error) => {
        logger.error(undefined, "Ошибка при signalCheckAndClear", error);
      }),
    ];

    await Promise.all(tasks);
  }

  // Таймер для функция
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
  // Подписка на все тикеры
  private async subscribeAllTickers(config: GetInstrumentsInfoParamsV5, category: CategoryV5) {
    const getData = async (cursor?: string) => {
      return await this.restClientV5.getInstrumentsInfo(cursor ? { ...config, cursor } : config);
    };
    let isEnd = false;
    let cursor: string | undefined;
    while (!isEnd) {
      const data = await getData(cursor);
      const topics = data.result.list
        .filter((item) => item.symbol.endsWith("USDT"))
        .map((item) => `tickers.${item.symbol}`);

      await this.webSocketClient.subscribeV5(topics, category);

      if (data.result.nextPageCursor) {
        cursor = data.result.nextPageCursor;
      } else {
        isEnd = true;
      }
    }
  }

  // Обработчик тикеров
  private async processTickers(
    tickerQueue: IByBitTickersWsRes[],
    uniqueSymbols: Set<string>,
    measureExecutionTimeName: string,
    onTickerUpdateFunction: (tickers: IByBitTickersWsRes[]) => Promise<void>,
    interval: number
  ) {
    let isProcessing = false;

    const processTickerQueue = async () => {
      if (isProcessing) {
        return;
      }
      isProcessing = true;

      const tickersToProcess = [...tickerQueue];
      tickerQueue.length = 0;
      uniqueSymbols.clear();

      if (tickersToProcess.length > 0) {
        try {
          await this.measureExecutionTime(
            measureExecutionTimeName,
            () => onTickerUpdateFunction(tickersToProcess),
            ` , тикеров в последней очереди: ${tickersToProcess.length}`
          );
        } catch (error) {
          logger.error(undefined, "Ошибка при обработке тикеров", error);
        }
      }

      isProcessing = false;

      if (tickerQueue.length > 0) {
        setTimeout(processTickerQueue, interval);
      }
    };

    return processTickerQueue;
  }

  // Подписка на тикеры
  private subscribeToTickers(
    uniqueSymbols: Set<string>,
    tickerQueue: IByBitTickersWsRes[],
    processTickerQueue: () => void,
    interval: number,
    filterFunction: (ticker: IByBitApiResponse) => boolean
  ) {
    let isProcessing = false;

    this.webSocketClient.on("update", (ticker: IByBitApiResponse) => {
      if (filterFunction(ticker)) {
        uniqueSymbols.add(ticker.data.symbol);
        tickerQueue.push(ticker.data);
      }

      if (!isProcessing) {
        isProcessing = true;
        setTimeout(() => {
          processTickerQueue();
          isProcessing = false;
        }, interval);
      }
    });
  }

  // Обработчик тикеров ПАМП
  private async pumpProcess() {
    const tickerQueue: IByBitTickersWsRes[] = [];
    const uniqueSymbols = new Set<string>();
    const processTickerQueue = await this.processTickers(
      tickerQueue,
      uniqueSymbols,
      "onTickerUpdatePUMPByBit",
      this.onTickerUpdatePUMP.bind(this),
      1000
    );

    this.subscribeToTickers(
      uniqueSymbols,
      tickerQueue,
      processTickerQueue,
      1000,
      (ticker) => !uniqueSymbols.has(ticker.data.symbol) && ticker.data.lastPrice !== undefined
    );
  }

  // Обработчик проверки, существует ли тикер у всех пользователей в БД ПАМП
  private async pumpCheckerProcess() {
    const tickerQueue: IByBitTickersWsRes[] = [];
    const uniqueSymbols = new Set<string>();
    const processTickerQueue = await this.processTickers(
      tickerQueue,
      uniqueSymbols,
      "pumpTickersExist",
      this.pumpTickersExist.bind(this),
      5000
    );

    this.subscribeToTickers(
      uniqueSymbols,
      tickerQueue,
      processTickerQueue,
      5000,
      (ticker) => !uniqueSymbols.has(ticker.data.symbol) && ticker.data.lastPrice !== undefined
    );
  }

  // Обработчик тикеров OI
  private async oiProcess() {
    const tickerQueue: IByBitTickersWsRes[] = [];
    const uniqueSymbols = new Set<string>();
    const processTickerQueue = await this.processTickers(
      tickerQueue,
      uniqueSymbols,
      "onTickerUpdateOI",
      this.onTickerUpdateOI.bind(this),
      1000
    );

    this.subscribeToTickers(
      uniqueSymbols,
      tickerQueue,
      processTickerQueue,
      1000,
      (ticker) =>
        !uniqueSymbols.has(ticker.data.symbol) &&
        ticker.data.openInterestValue !== undefined &&
        ticker.data.lastPrice !== undefined
    );
  }

  // Обработчик проверки, существует ли тикер у всех пользователей в БД OI
  private async oiCheckerProcess() {
    const tickerQueue: IByBitTickersWsRes[] = [];
    const uniqueSymbols = new Set<string>();
    const processTickerQueue = await this.processTickers(
      tickerQueue,
      uniqueSymbols,
      "oiCheckerProcess",
      this.oiTickersExist.bind(this),
      5000
    );

    this.subscribeToTickers(
      uniqueSymbols,
      tickerQueue,
      processTickerQueue,
      5000,
      (ticker) =>
        !uniqueSymbols.has(ticker.data.symbol) &&
        ticker.data.openInterestValue !== undefined &&
        ticker.data.lastPrice !== undefined
    );
  }

  // Обработчик Pupm
  private async onTickerUpdatePUMP(tickers: IByBitTickersWsRes[]) {
    const symbols = [...new Set(tickers.map((ticker) => ticker.symbol))];
    const pumpRecords = await this.getPumpRecords(symbols);
    const recordsBySymbol = this.groupRecordsBySymbol(pumpRecords);

    const dataUpdate = this.processPumpTickers(tickers, recordsBySymbol);

    await this.bulkUpdateRecords(dataUpdate, ByBit_PUMP);
  }

  // Обработчик OI
  private async onTickerUpdateOI(tickers: IByBitTickersWsRes[]) {
    const symbols = [...new Set(tickers.map((ticker) => ticker.symbol))];
    const oiRecords = await this.getOIRecords(symbols);
    const recordsBySymbol = this.groupRecordsBySymbol(oiRecords);

    const dataUpdate = this.processOITickers(tickers, recordsBySymbol);

    await this.bulkUpdateRecords(dataUpdate, ByBit_OI);
  }

  private async getPumpRecords(symbols: string[]) {
    return await ByBit_PUMP.find({ symbol: { $in: symbols } })
      .populate({
        path: "user",
        select: "user_id is_admin subscription_active subscription_expires_at trial_expires_at preferred_language is_banned",
        populate: {
          path: "config",
          select: "exchange pump_growth_period pump_recession_period pump_growth_percentage pump_recession_percentage",
          match: { exchange: { $in: ["bybit"] } },
        },
      })
      .lean() // Возвращает plain JS objects вместо Mongoose documents - быстрее
      .then((records) => records.filter((record) => record.user && record.user.config));
  }

  private async getOIRecords(symbols: string[]) {
    return await ByBit_OI.find({ symbol: { $in: symbols } })
      .populate({
        path: "user",
        select: "user_id is_admin subscription_active subscription_expires_at trial_expires_at preferred_language is_banned",
        populate: {
          path: "config",
          select: "exchange oi_growth_period oi_recession_period oi_growth_percentage oi_recession_percentage",
          match: { exchange: { $in: ["bybit"] } },
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

  private processPumpTickers(tickers: IByBitTickersWsRes[], recordsBySymbol: { [key: string]: any[] }) {
    const dataUpdate: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] = [];

    for (const ticker of tickers) {
      const pump_records = recordsBySymbol[ticker.symbol];
      if (!pump_records) continue;

      // Группируем записи по настройкам (period + percentage)
      // Пользователи с одинаковыми настройками должны получать одинаковые сигналы
      const groupedBySettings = this.groupPumpRecordsBySettings(pump_records);

      for (const group of Object.values(groupedBySettings)) {
        // Используем первую запись группы как эталон для расчётов
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
      // Ключ = period_growth + period_recession + percentage_growth + percentage_recession
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
    ticker: IByBitTickersWsRes,
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
          data.priceGrowth = Number(ticker.lastPrice);
          data.last_update_growth = now;
        }
        if (isTimeToResetRecession) {
          data.priceRecession = Number(ticker.lastPrice);
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

    // Проверяем условие сигнала
    const shouldSignalGrowth = pump_change_growth >= config.pump_growth_percentage;
    const shouldSignalRecession = pump_change_recession < 0 && Math.abs(pump_change_recession) >= config.pump_recession_percentage;

    if (shouldSignalGrowth) {
      // Отправляем сигнал ВСЕМ пользователям в группе и обновляем ВСЕ записи
      for (const record of group) {
        this.sendPumpSignal(ticker, record, pump_change_growth, "growth");
        updates.push({
          filter: { symbol: ticker.symbol, user: record.user._id },
          data: {
            priceGrowth: Number(ticker.lastPrice),
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
            priceRecession: Number(ticker.lastPrice),
            last_update_recession: now,
            h24_signal_count_recession: record.h24_signal_count_recession + 1,
          },
        });
      }
    }

    return updates.length > 0 ? { updates } : null;
  }

  private processOITickers(tickers: IByBitTickersWsRes[], recordsBySymbol: { [key: string]: any[] }) {
    const dataUpdate: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] = [];

    for (const ticker of tickers) {
      const oi_records = recordsBySymbol[ticker.symbol];
      if (!oi_records) continue;

      // Группируем записи по настройкам (period + percentage)
      const groupedBySettings = this.groupOIRecordsBySettings(oi_records);

      for (const group of Object.values(groupedBySettings)) {
        const referenceRecord = group[0];
        const result = this.processOIRecordGroup(ticker, referenceRecord, group);

        if (result) {
          dataUpdate.push(...result.updates);
        }
      }
    }

    return dataUpdate;
  }

  // Группировка записей по настройкам OI
  private groupOIRecordsBySettings(records: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};

    for (const record of records) {
      const config = record.user.config;
      const key = `${config.oi_growth_period}_${config.oi_recession_period}_${config.oi_growth_percentage}_${config.oi_recession_percentage}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(record);
    }

    return groups;
  }

  // Обработка группы записей OI с одинаковыми настройками
  private processOIRecordGroup(
    ticker: IByBitTickersWsRes,
    referenceRecord: any,
    group: any[]
  ): { updates: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] } | null {
    const { updateTimeGrowth, updateTimeRecession } = getUpdateTimeOI(referenceRecord, referenceRecord.user.config);
    const now = new Date();
    const updates: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[] = [];

    const isTimeToResetGrowth = updateTimeGrowth.getTime() <= now.getTime();
    const isTimeToResetRecession = updateTimeRecession.getTime() <= now.getTime();

    // Если время сброса - обновляем точку отсчёта для ВСЕХ в группе
    if (isTimeToResetGrowth || isTimeToResetRecession) {
      for (const record of group) {
        const data: { [key: string]: any } = {};
        if (isTimeToResetGrowth) {
          data.priceGrowth = Number(ticker.lastPrice);
          data.openInterestValueGrowth = Number(ticker.openInterestValue);
          data.last_update_growth = now;
        }
        if (isTimeToResetRecession) {
          data.priceRecession = Number(ticker.lastPrice);
          data.openInterestValueRecession = Number(ticker.openInterestValue);
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
    const { oi_change_growth, oi_change_recession } = getOpenInterestValueChange(ticker, referenceRecord);
    const config = referenceRecord.user.config;

    const shouldSignalGrowth = oi_change_growth >= config.oi_growth_percentage;
    const shouldSignalRecession = oi_change_recession < 0 && Math.abs(oi_change_recession) >= config.oi_recession_percentage;

    if (shouldSignalGrowth) {
      for (const record of group) {
        this.sendOISignal(ticker, record, oi_change_growth, "growth");
        updates.push({
          filter: { symbol: ticker.symbol, user: record.user._id },
          data: {
            openInterestValueGrowth: Number(ticker.openInterestValue),
            priceGrowth: Number(ticker.lastPrice),
            last_update_growth: now,
            h24_signal_count_growth: record.h24_signal_count_growth + 1,
          },
        });
      }
    } else if (shouldSignalRecession) {
      for (const record of group) {
        this.sendOISignal(ticker, record, Math.abs(oi_change_recession), "recession");
        updates.push({
          filter: { symbol: ticker.symbol, user: record.user._id },
          data: {
            openInterestValueRecession: Number(ticker.openInterestValue),
            priceRecession: Number(ticker.lastPrice),
            last_update_recession: now,
            h24_signal_count_recession: record.h24_signal_count_recession + 1,
          },
        });
      }
    }

    return updates.length > 0 ? { updates } : null;
  }

  private processPumpRecord(ticker: IByBitTickersWsRes, pump_record: any) {
    const { updateTimeGrowth, updateTimeRecession } = getUpdateTimePUMP(pump_record, pump_record.user.config);
    const isUpdatedTime = { updatedTimeGrowth: false, updatedTimeRecession: false };
    let updateForUser: { filter?: { symbol: string; user: string }; data?: { [key: string]: any } } = {};

    if (updateTimeGrowth.getTime() <= new Date().getTime()) {
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: { ...updateForUser.data, priceGrowth: Number(ticker.lastPrice), last_update_growth: new Date() },
      };
      isUpdatedTime.updatedTimeGrowth = true;
    }

    if (updateTimeRecession.getTime() <= new Date().getTime()) {
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: { ...updateForUser.data, priceRecession: Number(ticker.lastPrice), last_update_recession: new Date() },
      };
      isUpdatedTime.updatedTimeRecession = true;
    }

    const { pump_change_recession, pump_change_growth } = getPumpChange(ticker, pump_record);

    if (!isUpdatedTime.updatedTimeGrowth && pump_change_growth >= pump_record.user.config.pump_growth_percentage) {
      this.sendPumpSignal(ticker, pump_record, pump_change_growth, "growth");
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: {
          ...updateForUser.data,
          priceGrowth: Number(ticker.lastPrice),
          last_update_growth: Date.now(),
          h24_signal_count_growth: pump_record.h24_signal_count_growth + 1,
        },
      };
    } else if (
      !isUpdatedTime.updatedTimeRecession &&
      pump_change_recession < 0 &&
      Math.abs(pump_change_recession) >= pump_record.user.config.pump_recession_percentage
    ) {
      this.sendPumpSignal(ticker, pump_record, Math.abs(pump_change_recession), "recession");
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: {
          ...updateForUser.data,
          priceRecession: Number(ticker.lastPrice),
          last_update_recession: Date.now(),
          h24_signal_count_recession: pump_record.h24_signal_count_recession + 1,
        },
      };
    }

    return updateForUser.filter ? updateForUser : null;
  }

  private processOIRecord(ticker: IByBitTickersWsRes, pump_record: any) {
    const { updateTimeGrowth, updateTimeRecession } = getUpdateTimeOI(pump_record, pump_record.user.config);
    const isUpdatedTime = { updatedTimeGrowth: false, updatedTimeRecession: false };
    let updateForUser: {
      filter?: { symbol: string; user: string };
      data?: {
        priceGrowth?: number;
        priceRecession?: number;
        openInterestValueGrowth?: number;
        openInterestValueRecession?: number;
        last_update_growth?: Date;
        last_update_recession?: Date;
        h24_signal_count_recession?: number;
        h24_signal_count_growth?: number;
      };
    } = {};

    if (updateTimeGrowth.getTime() <= new Date().getTime()) {
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: {
          ...updateForUser.data,
          priceGrowth: Number(ticker.lastPrice),
          openInterestValueGrowth: Number(ticker.openInterestValue),
          last_update_growth: new Date(),
        },
      };
      isUpdatedTime.updatedTimeGrowth = true;
    }

    if (updateTimeRecession.getTime() <= new Date().getTime()) {
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: {
          ...updateForUser.data,
          priceRecession: Number(ticker.lastPrice),
          openInterestValueRecession: Number(ticker.openInterestValue),
          last_update_recession: new Date(),
        },
      };
      isUpdatedTime.updatedTimeRecession = true;
    }

    const { oi_change_growth, oi_change_recession } = getOpenInterestValueChange(ticker, pump_record);

    if (!isUpdatedTime.updatedTimeGrowth && oi_change_growth >= pump_record.user.config.oi_growth_percentage) {
      this.sendOISignal(ticker, pump_record, oi_change_growth, "growth");
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: {
          ...updateForUser.data,
          openInterestValueGrowth: Number(ticker.openInterestValue),
          priceGrowth: Number(ticker.lastPrice),
          last_update_growth: new Date(),
          h24_signal_count_growth: pump_record.h24_signal_count_growth + 1,
        },
      };
    } else if (
      !isUpdatedTime.updatedTimeRecession &&
      oi_change_recession < 0 &&
      Math.abs(oi_change_recession) >= pump_record.user.config.oi_recession_percentage
    ) {
      this.sendOISignal(ticker, pump_record, Math.abs(oi_change_recession), "recession");
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: {
          ...updateForUser.data,
          openInterestValueRecession: Number(ticker.openInterestValue),
          priceRecession: Number(ticker.lastPrice),
          last_update_recession: new Date(),
          h24_signal_count_recession: pump_record.h24_signal_count_recession + 1,
        },
      };
    }

    return updateForUser.filter ? updateForUser : null;
  }

  private async sendPumpSignal(
    ticker: IByBitTickersWsRes,
    pump_record: IByBit_PUMP,
    pump_change: number,
    type: "growth" | "recession"
  ) {
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
      update_pump(ticker.symbol, period, pump_change, price, Number(ticker.lastPrice), signals_count, type, "BYBIT", userLang)
    ).catch((err) => {
      logger.error(undefined, `Failed to queue PUMP message for user ${pump_record.user.user_id}: ${err.message}`);
    });
  }

  private async sendOISignal(
    updateData: IByBitTickersWsRes,
    ticker: IByBit_OI,
    oi_change: number,
    type: "growth" | "recession"
  ) {
    // Check if user has active subscription or trial
    const now = new Date();
    const user = ticker.user;

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
        `Skipping OI signal for user ${ticker.user.user_id} - no active subscription or trial`
      );
      return;
    }

    const signals_count =
      type === "growth" ? ticker.h24_signal_count_growth + 1 : ticker.h24_signal_count_recession + 1;
    const period = type === "growth" ? ticker.user.config.oi_growth_period : ticker.user.config.oi_recession_period;
    const { pump_change_growth, pump_change_recession } =
      type === "growth" ? getPumpChange(updateData, ticker) : getPumpChange(updateData, ticker);
    const oi_change_value =
      type === "growth"
        ? (Number(updateData.openInterestValue) - ticker.openInterestValueGrowth).toFixed(2)
        : (ticker.openInterestValueRecession - Number(updateData.openInterestValue)).toFixed(2);
    const change_price = type === "growth" ? pump_change_growth : pump_change_recession;

    // Get user's preferred language
    const userLang = ticker.user.preferred_language || "en";

    // Используем очередь для rate-limited отправки сообщений
    telegramQueueService.send(
      String(ticker.user.user_id),
      update_oi(
        ticker.symbol,
        period,
        oi_change,
        Number(oi_change_value),
        change_price,
        signals_count,
        type,
        "BYBIT",
        userLang
      )
    ).catch((err) => {
      logger.error(undefined, `Failed to queue OI message for user ${ticker.user.user_id}: ${err.message}`);
    });
  }

  private async bulkUpdateRecords(
    dataUpdate: { filter: { symbol: string; user: string }; data: { [key: string]: any } }[],
    model: any
  ) {
    const bulkOperations = dataUpdate.map((update) => ({
      updateOne: {
        filter: update.filter,
        update: { $set: update.data },
      },
    }));

    await model
      .bulkWrite(bulkOperations)
      .then((res: { modifiedCount: number }) => {
        logger.debug(undefined, `Успешно изменено ${res.modifiedCount} записей в ${model.modelName}`);
      })
      .catch((error: any) => {
        logger.error(undefined, `Ошибка при обновление записей в ${model.modelName}`, error);
      });
  }

  // Проверяет, существует ли данный тикер в базе у игрока, если нет - то добавляет его в базу
  // Оптимизировано: batch upsert вместо последовательных запросов
  private async pumpTickersExist(tickers: IByBitTickersWsRes[]) {
    const symbols = [...new Set(tickers.map((t) => t.symbol))];
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    // Получаем всех пользователей у которых нет хотя бы одного из символов
    const usersWithoutRecords = await UserService.getUsersWithoutByBitPumpSymbols(symbols);

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
                priceGrowth: Number(ticker.lastPrice),
                priceRecession: Number(ticker.lastPrice),
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
      await ByBit_PUMP.bulkWrite(bulkOps, { ordered: false });
      logger.debug(undefined, `Batch upsert: ${bulkOps.length} записей ByBit_pumps`);
    }
  }

  // Проверяет, существует ли данный тикер в базе у игрока, если нет - то добавляет его в базу
  // Оптимизировано: batch upsert вместо последовательных запросов
  private async oiTickersExist(tickers: IByBitTickersWsRes[]) {
    const symbols = [...new Set(tickers.map((t) => t.symbol))];
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    // Получаем всех пользователей у которых нет хотя бы одного из символов
    const usersWithoutRecords = await UserService.getUsersWithoutByBitOISymbols(symbols);

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
                priceGrowth: Number(ticker.lastPrice),
                priceRecession: Number(ticker.lastPrice),
                openInterestValueGrowth: Number(ticker.openInterestValue),
                openInterestValueRecession: Number(ticker.openInterestValue),
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
      await ByBit_OI.bulkWrite(bulkOps, { ordered: false });
      logger.debug(undefined, `Batch upsert: ${bulkOps.length} записей ByBit_ois`);
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
  // Оптимизировано: обновляем только записи где счётчик > 0 (используются индексы)
  public async clearTickersCounts() {
    await Promise.all([
      ByBit_OI.updateMany(
        { $or: [{ h24_signal_count_growth: { $gt: 0 } }, { h24_signal_count_recession: { $gt: 0 } }] },
        { h24_signal_count_growth: 0, h24_signal_count_recession: 0 }
      ),
      ByBit_PUMP.updateMany(
        { $or: [{ h24_signal_count_growth: { $gt: 0 } }, { h24_signal_count_recession: { $gt: 0 } }] },
        { h24_signal_count_growth: 0, h24_signal_count_recession: 0 }
      ),
      ByBit_REKT.updateMany(
        { h24_signal_count_liq: { $gt: 0 } },
        { h24_signal_count_liq: 0 }
      ),
    ]);
  }

  static getService(bot: Context) {
    return new ByBitSevice(bot);
  }
}

export default ByBitSevice;
