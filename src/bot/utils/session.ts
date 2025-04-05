import logger from "./logger";
import { WizardContext, WizardSession, WizardSessionData } from "telegraf/typings/scenes";


type SessionDataField = keyof WizardSession<WizardSessionData>;

/**
 * Saving data to the session
 * @param ctx - telegram context
 * @param field - field to store in
 * @param data - data to store
 */
export function saveToSession(ctx: any, field: any, data: any) {
  logger.debug(ctx, "Saving %s to session", field);
  ctx.session[field] = data;
}

/**
 * Removing data from the session
 * @param ctx - telegram context
 * @param field - field to delete
 */
export function deleteFromSession(ctx: any, field: any) {

  logger.debug(ctx, "Deleting %s from session", field);
  if (ctx.session) {
    
    delete ctx.session[field];
  }
}
