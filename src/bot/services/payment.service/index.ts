import axios from "axios";
import { Payment, User } from "../../models";
import logger from "../../utils/logger";

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1";
const IPN_CALLBACK_URL = process.env.IPN_CALLBACK_URL || "http://localhost:3000/webhooks/nowpayments";

interface CreatePaymentParams {
  user_id: number;
  amount: number;
  currency?: string;
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

  constructor() {
    this.apiKey = NOWPAYMENTS_API_KEY;
    this.apiUrl = NOWPAYMENTS_API_URL;
  }

  /**
   * Create a payment for subscription
   */
  async createPayment({ user_id, amount, currency = "usd" }: CreatePaymentParams) {
    try {
      const orderId = `subscription_${user_id}_${Date.now()}`;

      const response = await axios.post<NOWPaymentsResponse>(
        `${this.apiUrl}/payment`,
        {
          price_amount: amount,
          price_currency: currency,
          pay_currency: "btc", // Default to BTC, можно дать выбор пользователю
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
      logger.error(undefined, "Error creating payment", error.response?.data || error.message);
      throw new Error("Failed to create payment");
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

      // If payment is finished, activate subscription
      if (payment_status === 'finished' || payment_status === 'confirmed') {
        await this.activateSubscription(payment.user_id);
      }

      // If payment failed or expired, notify user
      if (payment_status === 'failed' || payment_status === 'expired') {
        // TODO: Notify user about failed payment
        logger.info(undefined, `Payment ${payment_status} for user ${payment.user_id}`);
      }
    } catch (error) {
      logger.error(undefined, "Error handling webhook", error);
      throw error;
    }
  }

  /**
   * Activate subscription for user
   */
  async activateSubscription(user_id: number) {
    try {
      const user = await User.findOne({ user_id });

      if (!user) {
        logger.error(undefined, `User not found: ${user_id}`);
        return;
      }

      // Set subscription active for 30 days
      const now = new Date();
      const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

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
