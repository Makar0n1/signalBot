import { Context } from "telegraf";
import BinanceApi, { Binance, ForceOrder, Ticker } from "binance-api-node";
import moment from "moment-timezone";
import { differenceInMilliseconds } from "date-fns";

import { Binance_OI, Binance_PUMP, Binance_REKT } from "../../models";
import UserService from "./../user.service";
import { update_pump, update_rekt } from "../../utils/messages";
import { getPumpChange, getUpdateTimePUMP } from "./utils";
import logger from "../../utils/logger";

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
        populate: {
          path: "config",
          match: { exchange: "binance" },
        },
      })
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

      for (const pump_record of pump_records) {
        const updateForUser = this.processPumpRecord(ticker, pump_record);
        if (updateForUser) {
          if (updateForUser && updateForUser.filter && updateForUser.data) {
            dataUpdate.push(
              updateForUser as { filter: { symbol: string; user: string }; data: { [key: string]: any } }
            );
          }
        }
      }
    }

    return dataUpdate;
  }

  private processPumpRecord(ticker: Ticker, pump_record: any) {
    const { updateTimeGrowth, updateTimeRecession } = getUpdateTimePUMP(pump_record, pump_record.user.config);
    const isUpdatedTime = { updatedTimeGrowth: false, updatedTimeRecession: false };
    let updateForUser: { filter?: { symbol: string; user: string }; data?: { [key: string]: any } } = {};

    if (updateTimeGrowth.getTime() <= new Date().getTime()) {
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: { ...updateForUser.data, priceGrowth: Number(ticker.curDayClose), last_update_growth: new Date() },
      };
      isUpdatedTime.updatedTimeGrowth = true;
    }

    if (updateTimeRecession.getTime() <= new Date().getTime()) {
      updateForUser = {
        filter: { symbol: ticker.symbol, user: pump_record.user._id },
        data: { ...updateForUser.data, priceRecession: Number(ticker.curDayClose), last_update_recession: new Date() },
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
          priceGrowth: Number(ticker.curDayClose),
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
          priceRecession: Number(ticker.curDayClose),
          last_update_recession: Date.now(),
          h24_signal_count_recession: pump_record.h24_signal_count_recession + 1,
        },
      };
    }

    return updateForUser.filter ? updateForUser : null;
  }

  private async sendPumpSignal(ticker: Ticker, pump_record: any, pump_change: number, type: "growth" | "recession") {
    const signals_count =
      type === "growth" ? pump_record.h24_signal_count_growth + 1 : pump_record.h24_signal_count_recession + 1;
    const period =
      type === "growth" ? pump_record.user.config.pump_growth_period : pump_record.user.config.pump_recession_period;
    const price = type === "growth" ? pump_record.priceGrowth : pump_record.priceRecession;

    try {
      await this.Bot.telegram.sendMessage(
        String(pump_record.user.user_id),
        update_pump(
          ticker.symbol,
          period,
          pump_change,
          price,
          Number(ticker.curDayClose),
          signals_count,
          type,
          "BINANCE"
        ),
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }
      );
    } catch (err: any) {
      if (err.response && err.response.error_code === 403) {
        await UserService.findAndDeleteUser(Number(pump_record.user.user_id));
        logger.debug(
          undefined,
          `Не удалось отправить сообщение onTickerUpdateREKT, удаление юзера по user_id: ${pump_record.user.user_id}`
        );
      }
    }
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

  // Обработчик Pupm
  private async onTickerUpdateREKT(liquidation: ForceOrder): Promise<void> {
    const rect_records = await Binance_REKT.find({ symbol: liquidation.symbol })
      .populate({
        path: "user",
        populate: {
          path: "config",
          select: "rekt_limit",
          match: { exchange: "binance" },
        },
      })
      .then((records) => records.filter((record) => record.user && record.user.config));

    for (const rect_record of rect_records) {
      if (!rect_record.user?.config) {
        continue;
      }
      if (Number(liquidation.price) >= rect_record.user.config.rekt_limit) {
        const signals_count = rect_record.h24_signal_count_liq + 1;

        try {
          await this.Bot.telegram.sendMessage(
            String(rect_record.user.user_id),
            update_rekt(liquidation.symbol, Number(liquidation.price), liquidation.side, signals_count, "BINANCE"),
            {
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
            }
          );
        } catch (err: any) {
          if (err.response && err.response.error_code === 403) {
            await UserService.findAndDeleteUser(Number(rect_record.user.user_id));
            logger.debug(
              undefined,
              `Не удалось отправить сообщение onTickerUpdateREKT, удаление юзера по user_id: ${rect_record.user.user_id}`
            );
          }
        }

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
  private async checkTickersExist(tickers: Ticker[]) {
    const uniqueTickers = tickers.filter(
      (ticker, index, self) => index === self.findIndex((t) => t.symbol === ticker.symbol)
    );

    for (const ticker of uniqueTickers) {
      const usersWithoutBinanceRecords = await UserService.getBinancePumpRecordsForUsersWithoutSymbol(ticker.symbol);
      if (!usersWithoutBinanceRecords) {
        continue;
      }

      for (const user of usersWithoutBinanceRecords) {
        const filter = { symbol: ticker.symbol, user: user._id };
        const update = {
          $setOnInsert: {
            last_update_growth: new Date(),
            last_update_recession: new Date(),
            priceGrowth: Number(ticker.curDayClose),
            priceRecession: Number(ticker.curDayClose),
            h24_signal_count_recession: 0,
            h24_signal_count_growth: 0,
          },
        };

        await Binance_PUMP.updateOne(filter, update, { upsert: true });
        logger.debug(
          undefined,
          `Для пользователя с tg-id ${user.user_id} создана запись binance_pumps с ${ticker.symbol}`
        );
      }
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
  public async clearTickersCounts() {
    await Binance_OI.updateMany({}, { h24_signal_count_growth: 0, h24_signal_count_recession: 0 });
    await Binance_PUMP.updateMany({}, { h24_signal_count_growth: 0, h24_signal_count_recession: 0 });
    await Binance_REKT.updateMany({}, { h24_signal_count_liq: 0 });
  }

  static getService(bot: Context) {
    return new BinanceService(bot);
  }
}

export default BinanceService;
