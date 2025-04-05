import { Context } from "telegraf";
import logger from "./logger";

/**
 * Wrapper to catch async errors within a stage. Helps to avoid try catch blocks in there
 * @param fn - function to enter a stage
 */
const asyncWrapper = (fn: Function) => {
  return async function (ctx: Context, next: Function) {
    try {
      return await fn(ctx, next);
    } catch (error) {
      logger.error(ctx, "asyncWrapper error, %O", error);
    }
  };
};

export default asyncWrapper;
