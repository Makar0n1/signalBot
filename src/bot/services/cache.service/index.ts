import { createClient, RedisClientType } from "redis";

import { Binance_PUMP, IBinance_PUMP, IUser } from "../../models";
import logger from "../../utils/logger";
import { ChangeStreamDocument } from "mongodb";

interface IgetBinancePumpData {
  [key: string]: IBinance_PUMP;
}

class CacheService {
  private redisClient: RedisClientType;
  private initialized: boolean = false;

  constructor() {
    this.redisClient = createClient();
    this.init();
  }

  private async init() {
    try {
      // Ensure Redis client is connected
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }
      this.initialized = true;

      // Set up change stream on the Data collection
      const changeStream = Binance_PUMP.watch([], {
        fullDocument: "updateLookup", // Fetch the full document after update
        fullDocumentBeforeChange: "required", // Fetch the full document before delete
      });

      changeStream.on("change", (change) => {
        // Handle the change event
        this.handleDataChangeBinancePump(change);
      });

      logger.debug(undefined, "CacheService initialized and listening for changes.");
    } catch (error) {
      logger.error(undefined, "Error initializing CacheService:", error);
    }
  }

  private async handleDataChangeBinancePump(change: ChangeStreamDocument<IBinance_PUMP>) {
    if (!this.initialized) return;

    switch (change.operationType) {
      case "insert":
      case "replace":
      case "update":
        // Get the updated document from change.fullDocument
        const updatedDoc = change.fullDocument;

        if (updatedDoc) {
          const user = (await Binance_PUMP.findById(updatedDoc._id).populate("user"))?.user;
          // Create a key in the format [user.id][symbol]
          const key = `binance_pump:${updatedDoc.symbol}`;
          // Prepare the value to cache
          // Готовим новое значение для добавления в кэш.

          if (!user) {
            break;
          }

          const newValue = {
            [String(user.user_id)]: {
              priceGrowth: updatedDoc.priceGrowth,
              priceRecession: updatedDoc.priceRecession,
              last_update_growth: updatedDoc.last_update_growth,
              last_update_recession: updatedDoc.last_update_recession,
              h24_signal_count_recession: updatedDoc.h24_signal_count_recession,
              h24_signal_count_growth: updatedDoc.h24_signal_count_growth,
            },
          };

          // Получаем предыдущее значение из Redis.
          const prevValue = await this.redisClient.get(key);

          // Проверяем, если значение уже есть в Redis.
          let updatedCache;
          if (prevValue) {
            // Распарсим строку JSON в объект.
            const parsedPrev = JSON.parse(prevValue);

            // Добавляем или обновляем новое значение.
            updatedCache = {
              ...parsedPrev,
              ...newValue,
            };
          } else {
            // Если данных по ключу не было, записываем новое значение.
            updatedCache = newValue;
          }

          // Сохраняем обновлённое значение в Redis.
          await this.redisClient.set(key, JSON.stringify(updatedCache));
          logger.debug(undefined, `Cache updated in binance_pump for key: ${key}`);
        }
        break;

      case "delete":
        // For delete operations, use fullDocumentBeforeChange
        const deletedDoc = change.fullDocumentBeforeChange;
        if (deletedDoc) {
          const user = (await Binance_PUMP.findById(deletedDoc._id).populate("user"))?.user;
          const key = `binance_pump:${deletedDoc.symbol}`;
          const prevValue = await this.redisClient.get(key);

          if (!user) {
            break;
          }

          // Проверяем, если значение уже есть в Redis.
          if (prevValue) {
            // Распарсить строку JSON в объект
            const parsedPrev = JSON.parse(prevValue);

            // Удаляем запись по user.user_id, если она существует
            if (parsedPrev[String(user.user_id)]) {
              delete parsedPrev[String(user.user_id)];
            }

            // Если объект пуст после удаления записи, удаляем ключ из Redis
            if (Object.keys(parsedPrev).length === 0) {
              await this.redisClient.del(key);
            } else {
              // Сохраняем обновлённый объект обратно в Redis
              await this.redisClient.set(key, JSON.stringify(parsedPrev));
            }
          }

          logger.debug(undefined, `Cache deleted for key: ${key}`);
        } else {
          logger.debug(undefined, `fullDocumentBeforeChange not available; cannot remove from cache.`);
        }
        break;

      default:
        logger.debug(undefined, `Unhandled change operationType: ${change.operationType}`);
    }
  }

  /**
   * Retrieves Binance Pump data from the cache using the provided key.
   * @param symbol The ticker symbol
   * @returns The cached data as an object or null if not found.
   */
  public async getBinancePumpData(symbol: string): Promise<IgetBinancePumpData | null> {
    if (!this.initialized) {
      logger.debug(undefined, "CacheService not initialized. Cannot retrieve data.");
      return null;
    }

    try {
      const value = await this.redisClient.get(`binance_pump:${symbol}`);
      if (value) {
        const data = JSON.parse(value);

        logger.debug(undefined, `Data retrieved from cache for symbol: ${symbol}`);
        return data;
      } else {
        logger.debug(undefined, `No data found in cache for symbol: ${symbol}`);
        return null;
      }
    } catch (error) {
      logger.error(undefined, `Error retrieving data from cache for symbol ${symbol}:`, error);
      return null;
    }
  }
}

export default new CacheService();
