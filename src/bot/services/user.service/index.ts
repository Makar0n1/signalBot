import logger from "../../utils/logger";
import { IUser, IConfig, User as UserObj, IBinance_PUMP, Binance_REKT, Binance_PUMP } from "../../models";

interface IUserWithConfig extends IUser {
  config: IConfig;
  binanceRecords: IBinance_PUMP[];
}

class UserService {
  private User: typeof UserObj;

  constructor(user: typeof UserObj) {
    this.User = user;
  }

  // Create new user
  public async createUser(data: { user_id?: number; language_code?: string; username?: string }) {
    if (!data.user_id) {
      return;
    }
    try {
      const user = await this.User.findOne({ user_id: data.user_id });
      if (user) {
        logger.debug(undefined, `Пользователь с user_id: ${data.user_id} уже существует`);
        await this.User.updateOne({ user_id: data.user_id }, data);
        logger.debug(undefined, `Данные пользователя с user_id: ${data.user_id} обновлены`);
        return;
      }

      await this.User.create(data);
      logger.debug(undefined, `Создан пользователь с user_id: ${data.user_id}`);
    } catch (err) {
      logger.error(undefined, "Ошибка при создании пользователя", err);
    }
  }

  // Delete user
  public async findAndDeleteUser(user_id: number): Promise<IUser | null> {
    try {
      const user = await this.User.findOneAndDelete({ user_id });
      if (user) {
        logger.debug(undefined, `Пользователь с user_id: ${user_id} удалён`);
        return user;
      } else {
        logger.debug(undefined, `Пользователь с user_id: ${user_id} не найден`);
        return null;
      }
    } catch (err) {
      logger.error(undefined, "Ошибка при удалении пользователя", err);
      return null;
    }
  }

  public async updateUserConfig(user_id: number, data: IConfigUpdateData) {
    try {
      const user = await this.User.findOne({ user_id }).populate("config");
      if (!user) {
        logger.debug(undefined, `Не нашёлся пользователь с user_id: ${user_id} при обновлении конфига`);
        return;
      }
      const config: IConfig = user.config;
      Object.assign(config, data);

      await config.save();
      logger.debug(
        undefined,
        `Конфиг пользователя с user_id: ${user_id} успешно обновлён, изменено:\n${JSON.stringify(data, null, 2)}`
      );
    } catch (err) {
      logger.error(undefined, "Ошибка при обновлении конфига", err);
    }
  }

  // Получение всех пользователей у которых нету записи в binance_pumps с даннм символом
  public async getBinancePumpRecordsForUsersWithoutSymbol(symbol: string): Promise<IUser[]> {
    return this.getUsersWithoutSymbol(symbol, `binance_pumps`);
  }

  // Получение всех пользователей у которых нету записи в binance_rekt с даннм символом
  public async getBinanceRektRecordsForUsersWithoutSymbol(symbol: string): Promise<IUser[]> {
    return this.getUsersWithoutSymbol(symbol, "binance_rekts");
  }

  // Batch версия: получение пользователей без записей Binance PUMP для нескольких символов
  public async getBinancePumpRecordsForUsersWithoutSymbols(symbols: string[]): Promise<{ user: IUser; missingSymbols: string[] }[]> {
    return this.getUsersWithoutSymbols(symbols, "binance_pumps");
  }

  // Получение всех пользователей у которых есть записи в binance_pumps с даннм символом
  public async getBinancePumpRecordsForUsersWithSymbol(symbol: string): Promise<IUserWithConfig[]> {
    return this.getUsersWithSymbolAndConfig(symbol, "binance_pumps");
  }

  // Получение всех пользователей у которых есть записи в bybit_pumps с даннм символом
  public async getUsersWithoutByBitPumpSymbol(symbol: string): Promise<IUser[]> {
    return this.getUsersWithoutSymbol(symbol, "bybit_pumps");
  }

  // Получение всех пользователей у которых есть записи в bybit_ois с даннм символом
  public async getUsersWithoutByBitOISymbol(symbol: string): Promise<IUser[]> {
    return this.getUsersWithoutSymbol(symbol, "bybit_ois");
  }

  // Batch версия: получение пользователей без записей для нескольких символов сразу
  public async getUsersWithoutByBitPumpSymbols(symbols: string[]): Promise<{ user: IUser; missingSymbols: string[] }[]> {
    return this.getUsersWithoutSymbols(symbols, "bybit_pumps");
  }

  // Batch версия: получение пользователей без записей OI для нескольких символов сразу
  public async getUsersWithoutByBitOISymbols(symbols: string[]): Promise<{ user: IUser; missingSymbols: string[] }[]> {
    return this.getUsersWithoutSymbols(symbols, "bybit_ois");
  }

  // Вспомогательный метод для получения пользователей без записи с данным символом
  private async getUsersWithoutSymbol(symbol: string, collection: string): Promise<IUser[]> {
    try {
      const users = await this.User.aggregate([
        {
          $lookup: {
            from: collection,
            localField: "_id",
            foreignField: "user",
            as: "records",
          },
        },
        {
          $addFields: {
            hasSymbol: {
              $in: [symbol, "$records.symbol"],
            },
          },
        },
        {
          $match: {
            hasSymbol: false,
          },
        },
      ]);

      return users;
    } catch (error) {
      throw new Error(`Ошибка при получении пользователей без записи в ${collection} по символу: ${symbol}, ${error}`);
    }
  }

  // Batch версия: получение пользователей без записей для нескольких символов сразу
  // Возвращает массив { user, missingSymbols } для каждого пользователя
  private async getUsersWithoutSymbols(symbols: string[], collection: string): Promise<{ user: IUser; missingSymbols: string[] }[]> {
    try {
      const users = await this.User.aggregate([
        {
          $lookup: {
            from: collection,
            localField: "_id",
            foreignField: "user",
            as: "records",
          },
        },
        {
          $addFields: {
            existingSymbols: "$records.symbol",
            missingSymbols: {
              $filter: {
                input: symbols,
                as: "symbol",
                cond: { $not: { $in: ["$$symbol", "$records.symbol"] } },
              },
            },
          },
        },
        {
          $match: {
            "missingSymbols.0": { $exists: true }, // Только пользователи с хотя бы 1 отсутствующим символом
          },
        },
        {
          $project: {
            records: 0,
            existingSymbols: 0,
          },
        },
      ]);

      return users.map((u: IUser & { missingSymbols: string[] }) => ({ user: u, missingSymbols: u.missingSymbols }));
    } catch (error) {
      throw new Error(`Ошибка при получении пользователей без записей в ${collection}: ${error}`);
    }
  }

  // Вспомогательный метод для получения пользователей с записью и конфигурацией
  private async getUsersWithSymbolAndConfig(symbol: string, collection: string): Promise<IUserWithConfig[]> {
    try {
      const users = await this.User.aggregate([
        {
          $lookup: {
            from: collection,
            localField: "_id",
            foreignField: "user",
            as: "records",
          },
        },
        {
          $match: {
            records: {
              $elemMatch: {
                symbol: symbol,
              },
            },
          },
        },
        {
          $lookup: {
            from: "configs",
            localField: "_id",
            foreignField: "user",
            as: "config",
          },
        },
        {
          $unwind: {
            path: "$config",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $addFields: {
            records: {
              $filter: {
                input: "$records",
                as: "record",
                cond: { $eq: ["$$record.symbol", symbol] },
              },
            },
          },
        },
        {
          $match: {
            records: { $size: 1 },
          },
        },
      ]);

      return users;
    } catch (error) {
      throw new Error(`Ошибка при получении пользователей с записью в ${collection} по символу: ${symbol}, ${error}`);
    }
  }
}

export interface IConfigUpdateData {
  exchange?: ExchangeType;
  oi_growth_period?: number;
  oi_recession_period?: number;
  oi_growth_percentage?: number;
  oi_recession_percentage?: number;
  pump_growth_period?: number;
  pump_recession_period?: number;
  pump_growth_percentage?: number;
  pump_recession_percentage?: number;
  rekt_limit?: number;
}

type ExchangeType = ["bybit"] | ["binance"] | ["binance", "bybit"];

export default new UserService(UserObj);
