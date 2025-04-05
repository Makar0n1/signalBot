import logger from "../../utils/logger";
import { Guest as GuestObj } from "../../models";

class GuestService {
  private Guest: typeof GuestObj;

  constructor(guest: typeof GuestObj) {
    this.Guest = guest;
  }

  // Create new guest
  public async createGuest(data: { user_id?: number; language_code?: string; username?: string }) {
    if (!data.user_id) {
      return;
    }
    try {
      const guest = await this.Guest.findOne({ user_id: data.user_id });
      if (guest) {
        logger.debug(undefined, `Гость с user_id: ${data.user_id} уже существует`);
        await this.Guest.updateOne({ user_id: data.user_id }, data);
        logger.debug(undefined, `Данные гостя с user_id: ${data.user_id} обновлены`);
        return;
      }

      await this.Guest.create(data);
      logger.debug(undefined, `Создан гость с user_id: ${data.user_id}`);
    } catch (err) {
      logger.error(undefined, "Ошибка при создании гостя", err);
    }
  }
}

export default new GuestService(GuestObj);
