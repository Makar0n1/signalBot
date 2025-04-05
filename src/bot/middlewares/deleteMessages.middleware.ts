import { Context } from "telegraf";

import deleteMessages from "../utils/deleteMessages";
import asyncWrapper from "../utils/error-handler";
import { SESSION_FIELDS } from "../utils/CONST";
import { deleteFromSession } from "../utils/session";

const deleteMessageNext = (ctx: Context, next: Function) => {
  return asyncWrapper(async (ctx: Context, next: Function) => {
    deleteMessages(ctx, ctx.session[SESSION_FIELDS.DELETE_MESSAGES]);
    deleteFromSession(ctx, SESSION_FIELDS.DELETE_MESSAGES);

    return next();
  })(ctx, next);
};

const deleteMessageLeave = (ctx: Context, next: Function) => {
  return asyncWrapper(async (ctx: Context, next: Function) => {
    await deleteMessages(ctx, ctx.session[SESSION_FIELDS.DELETE_MESSAGES]);
    deleteFromSession(ctx, SESSION_FIELDS.DELETE_MESSAGES);

    return await ctx.scene.leave();
  })(ctx, next);
};

export { deleteMessageNext, deleteMessageLeave };
