import { Context } from "telegraf";
import asyncWrapper from "../utils/error-handler";
import { User } from "../models";

export const isUser = (ctx: Context, next: Function) => {
  return asyncWrapper(async (ctx: Context, next: Function) => {
    const user = await User.findOne({ user_id: ctx.message?.from.id });

    if (user) {
      return next();
    }
  })(ctx, next);
};
