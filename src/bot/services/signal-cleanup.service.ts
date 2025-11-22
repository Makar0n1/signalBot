import { Telegraf, Context } from "telegraf";
import { SentSignal } from "../models";
import logger from "../utils/logger";

/**
 * SignalCleanupService - Auto-delete signals after 24 hours
 *
 * Features:
 * - Checks every 12 hours for signals older than 24 hours
 * - Deletes messages from Telegram
 * - Removes records from database
 * - Handles errors gracefully (message already deleted, etc.)
 */
class SignalCleanupService {
  private bot: Telegraf<Context> | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  // Configuration
  private readonly CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private readonly MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly BATCH_SIZE = 100; // Process messages in batches
  private readonly DELAY_BETWEEN_DELETES_MS = 50; // Rate limit protection

  /**
   * Initialize the service with bot instance
   */
  initialize(bot: Telegraf<Context>): void {
    this.bot = bot;
    this.startScheduler();
    logger.info(undefined, "SignalCleanupService initialized (checking every 12 hours)");
  }

  /**
   * Start the scheduled cleanup
   */
  private startScheduler(): void {
    // Run initial check after 1 minute (give system time to start)
    setTimeout(() => this.performCleanup(), 60 * 1000);

    // Schedule regular checks
    this.intervalId = setInterval(() => this.performCleanup(), this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info(undefined, "SignalCleanupService stopped");
    }
  }

  /**
   * Perform cleanup of old signals
   */
  async performCleanup(): Promise<void> {
    if (!this.bot) {
      logger.warn(undefined, "SignalCleanupService: Bot not initialized");
      return;
    }

    const cutoffTime = new Date(Date.now() - this.MESSAGE_AGE_MS);
    let totalDeleted = 0;
    let totalErrors = 0;

    logger.info(undefined, `SignalCleanupService: Starting cleanup of signals older than ${cutoffTime.toISOString()}`);

    try {
      // Process in batches to avoid memory issues
      let hasMore = true;

      while (hasMore) {
        const oldSignals = await SentSignal.find({
          sent_at: { $lt: cutoffTime }
        })
          .limit(this.BATCH_SIZE)
          .lean();

        if (oldSignals.length === 0) {
          hasMore = false;
          break;
        }

        for (const signal of oldSignals) {
          try {
            // Try to delete the message from Telegram
            await this.bot.telegram.deleteMessage(signal.chat_id, signal.message_id);
            totalDeleted++;
          } catch (error: any) {
            // Message might already be deleted or bot lacks permissions
            const errorCode = error.response?.error_code;
            if (errorCode === 400 || errorCode === 403) {
              // 400: message not found (already deleted)
              // 403: bot doesn't have permission
              // Both are fine, just remove from DB
              totalDeleted++;
            } else {
              logger.debug(undefined, `Failed to delete message ${signal.message_id} for user ${signal.user_id}: ${error.message}`);
              totalErrors++;
            }
          }

          // Remove from database regardless of Telegram result
          await SentSignal.deleteOne({ _id: signal._id });

          // Small delay to avoid rate limiting
          await this.delay(this.DELAY_BETWEEN_DELETES_MS);
        }
      }

      logger.info(undefined, `SignalCleanupService: Cleanup completed. Deleted: ${totalDeleted}, Errors: ${totalErrors}`);
    } catch (error) {
      logger.error(undefined, "SignalCleanupService: Error during cleanup", error);
    }
  }

  /**
   * Track a sent signal message for later cleanup
   */
  async trackSignal(userId: number, chatId: number, messageId: number): Promise<void> {
    try {
      await SentSignal.create({
        user_id: userId,
        message_id: messageId,
        chat_id: chatId,
        sent_at: new Date()
      });
    } catch (error) {
      logger.error(undefined, `Failed to track signal for user ${userId}`, error);
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStats(): Promise<{ pendingCount: number; oldestSignal: Date | null }> {
    const count = await SentSignal.countDocuments();
    const oldest = await SentSignal.findOne().sort({ sent_at: 1 }).lean();

    return {
      pendingCount: count,
      oldestSignal: oldest?.sent_at || null
    };
  }

  /**
   * Manual cleanup trigger (for testing)
   */
  async triggerCleanup(): Promise<void> {
    logger.info(undefined, "Manual signal cleanup triggered");
    await this.performCleanup();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
const signalCleanupService = new SignalCleanupService();
export default signalCleanupService;
