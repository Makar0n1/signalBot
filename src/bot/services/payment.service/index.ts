import axios from "axios";
import crypto from "crypto";
import { Telegraf } from "telegraf";
import { Payment, User } from "../../models";
import logger from "../../utils/logger";
import getMainKeyboard from "../../keyboards/main.keyboard";
import { t, Language } from "../../utils/i18n";

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";
const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1";
const IPN_CALLBACK_URL = process.env.IPN_CALLBACK_URL || "http://localhost:3000/webhooks/nowpayments";

interface CreatePaymentParams {
  user_id: number;
  amount: number;
  currency?: string; // price_currency (USD, EUR, etc.)
  pay_currency?: string; // crypto currency (btc, eth, usdttrc20, etc.)
}

interface NOWPaymentsResponse {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id?: string;
  purchase_id?: string;
}

class PaymentService {
  private apiKey: string;
  private apiUrl: string;
  private bot?: Telegraf;

  constructor() {
    this.apiKey = NOWPAYMENTS_API_KEY;
    this.apiUrl = NOWPAYMENTS_API_URL;
  }

  /**
   * Set bot instance for sending notifications
   */
  setBot(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * Get estimated price to ensure we meet minimum requirements
   */
  async getEstimatedPrice(amount: number, currency: string, pay_currency: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/estimate`, {
        params: {
          amount: amount,
          currency_from: currency,
          currency_to: pay_currency,
        },
        headers: {
          "x-api-key": this.apiKey,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error(undefined, "Error getting estimate", error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Create a payment for subscription
   */
  async createPayment({ user_id, amount, currency = "usd", pay_currency = "btc" }: CreatePaymentParams) {
    try {
      // Validate API key
      if (!this.apiKey || this.apiKey.trim() === "") {
        throw new Error("NOWPAYMENTS_API_KEY is not configured");
      }

      const orderId = `subscription_${user_id}_${Date.now()}`;

      // Get estimate to check minimum amount
      const estimate = await this.getEstimatedPrice(amount, currency, pay_currency);

      let finalAmount = amount;
      if (estimate && estimate.min_amount) {
        // If estimated amount is less than minimum, adjust the price
        if (estimate.estimated_amount < estimate.min_amount) {
          // Calculate how much more we need in USD
          const ratio = estimate.min_amount / estimate.estimated_amount;
          finalAmount = amount * ratio + 0.5; // Add small buffer
          logger.info(undefined, `Adjusted amount to meet minimum: ${amount} -> ${finalAmount}`);
        }
      } else {
        // Fallback: add buffer if we can't get estimate
        finalAmount = amount + 1;
      }

      logger.info(undefined, `Creating payment for user ${user_id}`, {
        original_amount: amount,
        final_amount: finalAmount,
        price_currency: currency,
        pay_currency: pay_currency,
        order_id: orderId,
        estimate: estimate
      });

      const response = await axios.post<NOWPaymentsResponse>(
        `${this.apiUrl}/payment`,
        {
          price_amount: finalAmount,
          price_currency: currency,
          pay_currency: pay_currency,
          ipn_callback_url: IPN_CALLBACK_URL,
          order_id: orderId,
          order_description: `Подписка на бота - 1 месяц`,
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      const paymentData = response.data;

      // Save payment to database
      const payment = await Payment.create({
        user_id,
        payment_id: paymentData.payment_id,
        amount: paymentData.price_amount,
        currency: paymentData.price_currency,
        status: 'waiting',
        pay_address: paymentData.pay_address,
        pay_amount: paymentData.pay_amount,
        pay_currency: paymentData.pay_currency,
        order_id: paymentData.order_id,
        purchase_id: paymentData.purchase_id,
      });

      logger.info(undefined, `Payment created for user ${user_id}: ${paymentData.payment_id}`);

      return {
        payment_id: paymentData.payment_id,
        pay_address: paymentData.pay_address,
        pay_amount: paymentData.pay_amount,
        pay_currency: paymentData.pay_currency,
        order_id: orderId,
      };
    } catch (error: any) {
      logger.error(undefined, "Error creating payment", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      throw new Error(`Failed to create payment: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(paymentId: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/payment/${paymentId}`, {
        headers: {
          "x-api-key": this.apiKey,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error(undefined, "Error checking payment status", error.response?.data || error.message);
      throw new Error("Failed to check payment status");
    }
  }

  /**
   * Handle payment webhook (IPN)
   */
  async handleWebhook(webhookData: any) {
    try {
      const { payment_id, payment_status, order_id } = webhookData;

      logger.info(undefined, `Webhook received for payment ${payment_id}: ${payment_status}`);

      // Find payment in database
      const payment = await Payment.findOne({ payment_id });

      if (!payment) {
        logger.warn(undefined, `Payment not found: ${payment_id}`);
        return;
      }

      // Update payment status
      payment.status = payment_status;
      await payment.save();

      // If payment is finished, activate subscription and notify user
      if (payment_status === 'finished' || payment_status === 'confirmed') {
        await this.activateSubscription(payment.user_id);

        // Send notification to user
        if (this.bot) {
          try {
            const user = await User.findOne({ user_id: payment.user_id });
            const lang: Language = (user?.language_code?.startsWith('ru')) ? 'ru' : 'en';
            const { mainKeyboard } = getMainKeyboard();

            const message = `${t('payment.confirmed', lang)}\n\n${t('menu.bot_intro', lang)}`;

            await this.bot.telegram.sendMessage(
              payment.user_id,
              message,
              {
                parse_mode: "HTML",
                reply_markup: mainKeyboard.reply_markup
              }
            );
            logger.info(undefined, `Sent payment success notification to user ${payment.user_id}`);
          } catch (notifyError) {
            logger.error(undefined, `Failed to send notification to user ${payment.user_id}`, notifyError);
          }
        }
      }

      // If payment failed or expired, notify user
      if (payment_status === 'failed' || payment_status === 'expired') {
        if (this.bot) {
          try {
            const user = await User.findOne({ user_id: payment.user_id });
            const lang: Language = (user?.language_code?.startsWith('ru')) ? 'ru' : 'en';

            const messageKey = payment_status === 'failed' ? 'payment.failed' : 'payment.expired';

            await this.bot.telegram.sendMessage(
              payment.user_id,
              t(messageKey, lang),
              { parse_mode: "HTML" }
            );
            logger.info(undefined, `Sent payment ${payment_status} notification to user ${payment.user_id}`);
          } catch (notifyError) {
            logger.error(undefined, `Failed to send notification to user ${payment.user_id}`, notifyError);
          }
        }
      }
    } catch (error) {
      logger.error(undefined, "Error handling webhook", error);
      throw error;
    }
  }

  /**
   * Activate subscription for user
   * If user already has active subscription, extends it by 30 days
   */
  async activateSubscription(user_id: number) {
    try {
      const user = await User.findOne({ user_id });

      if (!user) {
        logger.error(undefined, `User not found: ${user_id}`);
        return;
      }

      const now = new Date();
      let expiryDate: Date;

      // Check if user already has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        // Extend existing subscription by 30 days
        expiryDate = new Date(user.subscription_expires_at.getTime() + 30 * 24 * 60 * 60 * 1000);
        logger.info(undefined, `Extending subscription for user ${user_id} from ${user.subscription_expires_at} to ${expiryDate}`);
      } else {
        // Start new subscription for 30 days
        expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        logger.info(undefined, `Starting new subscription for user ${user_id}, expires at ${expiryDate}`);
      }

      user.subscription_active = true;
      user.subscription_expires_at = expiryDate;
      await user.save();

      logger.info(undefined, `Subscription activated for user ${user_id}, expires at ${expiryDate}`);

      return {
        success: true,
        expires_at: expiryDate,
      };
    } catch (error) {
      logger.error(undefined, "Error activating subscription", error);
      throw error;
    }
  }

  /**
   * Verify IPN signature from NOWPayments
   */
  verifyIPNSignature(payload: any, receivedSignature: string): boolean {
    try {
      if (!NOWPAYMENTS_IPN_SECRET) {
        logger.warn(undefined, "IPN secret not configured, skipping signature verification");
        return true; // Allow if not configured (for development)
      }

      // Sort payload keys alphabetically and create string
      const sortedKeys = Object.keys(payload).sort();
      const signatureString = sortedKeys
        .map(key => `${key}=${JSON.stringify(payload[key])}`)
        .join('&');

      // Create HMAC signature
      const hmac = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET);
      hmac.update(signatureString);
      const calculatedSignature = hmac.digest('hex');

      logger.debug(undefined, "IPN Signature verification", {
        received: receivedSignature,
        calculated: calculatedSignature,
        match: calculatedSignature === receivedSignature
      });

      return calculatedSignature === receivedSignature;
    } catch (error) {
      logger.error(undefined, "Error verifying IPN signature", error);
      return false;
    }
  }

  /**
   * Check API status
   */
  async checkApiStatus() {
    try {
      const response = await axios.get(`${this.apiUrl}/status`, {
        headers: {
          "x-api-key": this.apiKey,
        },
      });

      logger.info(undefined, "NOWPayments API status", response.data);
      return response.data;
    } catch (error: any) {
      logger.error(undefined, "Error checking API status", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      return null;
    }
  }

  /**
   * Get available payment currencies
   */
  async getAvailableCurrencies() {
    try {
      const response = await axios.get(`${this.apiUrl}/currencies`, {
        headers: {
          "x-api-key": this.apiKey,
        },
      });

      return response.data.currencies || [];
    } catch (error: any) {
      logger.error(undefined, "Error getting currencies", error.response?.data || error.message);
      return [];
    }
  }
}

export default new PaymentService();
