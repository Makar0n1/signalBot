import { Telegraf } from "telegraf";
import { Context } from "telegraf";
import paymentService from "../services/payment.service";
import { User } from "../models";
import logger from "../utils/logger";

export default function subscriptionHandlers(bot: Telegraf<Context>) {
  // Handle subscribe button
  bot.action("subscribe", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const userId = ctx.from?.id;
      if (!userId) return;

      const user = await User.findOne({ user_id: userId });
      if (!user) {
        await ctx.replyWithHTML("❌ <b>Ошибка: пользователь не найден</b>");
        return;
      }

      // Check if user already has active subscription
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > new Date()) {
        await ctx.replyWithHTML(
          `✅ <b>У вас уже есть активная подписка!</b>\n\n` +
          `📅 Действует до: <code>${user.subscription_expires_at.toLocaleString('ru-RU')}</code>`
        );
        return;
      }

      await ctx.replyWithHTML(
        `💳 <b>Оформление подписки</b>\n\n` +
        `Выберите валюту для оплаты:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "₿ Bitcoin (BTC)", callback_data: "pay_btc" },
                { text: "Ξ Ethereum (ETH)", callback_data: "pay_eth" }
              ],
              [
                { text: "₮ USDT (TRC20)", callback_data: "pay_usdt_trc20" },
                { text: "₮ USDT (ERC20)", callback_data: "pay_usdt_erc20" }
              ],
              [
                { text: "💵 Другая валюта", callback_data: "pay_other" }
              ],
              [
                { text: "❌ Отмена", callback_data: "cancel_payment" }
              ]
            ]
          }
        }
      );
    } catch (error) {
      logger.error(undefined, "Error in subscribe handler", error);
      await ctx.replyWithHTML("❌ <b>Произошла ошибка. Попробуйте позже.</b>");
    }
  });

  // Handle payment currency selection
  const paymentHandlers: Record<string, string> = {
    "pay_btc": "btc",
    "pay_eth": "eth",
    "pay_usdt_trc20": "usdttrc20",
    "pay_usdt_erc20": "usdterc20",
  };

  Object.entries(paymentHandlers).forEach(([action, currency]) => {
    bot.action(action, async (ctx) => {
      try {
        await ctx.answerCbQuery("⏳ Создаём платёж...");

        const userId = ctx.from?.id;
        if (!userId) return;

        const price = parseFloat(process.env.SUBSCRIPTION_PRICE_USD || "10");

        // Create payment
        const payment = await paymentService.createPayment({
          user_id: userId,
          amount: price,
          currency: "usd"
        });

        await ctx.editMessageText(
          `💳 <b>Платёжная информация</b>\n\n` +
          `💰 Сумма: <code>${payment.pay_amount} ${payment.pay_currency.toUpperCase()}</code>\n` +
          `📬 Адрес для оплаты:\n<code>${payment.pay_address}</code>\n\n` +
          `⚠️ <b>Важно:</b> Отправьте точную сумму на указанный адрес. После подтверждения транзакции ваша подписка будет активирована автоматически.\n\n` +
          `⏰ Время на оплату: 60 минут\n\n` +
          `🔍 ID платежа: <code>${payment.payment_id}</code>`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Я оплатил", callback_data: `check_payment_${payment.payment_id}` }
                ],
                [
                  { text: "❌ Отменить", callback_data: "cancel_payment" }
                ]
              ]
            }
          }
        );

        logger.info(undefined, `Payment created for user ${userId}: ${payment.payment_id}`);
      } catch (error) {
        logger.error(undefined, "Error creating payment", error);
        await ctx.editMessageText(
          "❌ <b>Ошибка при создании платежа</b>\n\nПопробуйте позже или обратитесь в поддержку.",
          { parse_mode: "HTML" }
        );
      }
    });
  });

  // Handle payment check
  bot.action(/check_payment_(.+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery("⏳ Проверяем статус платежа...");

      const paymentId = ctx.match[1];
      const status = await paymentService.getPaymentStatus(paymentId);

      if (status.payment_status === "finished" || status.payment_status === "confirmed") {
        await ctx.editMessageText(
          `✅ <b>Платёж подтверждён!</b>\n\n` +
          `Спасибо за покупку подписки! Ваш доступ к боту активирован на 30 дней.\n\n` +
          `🎉 Приятного использования!`,
          { parse_mode: "HTML" }
        );
      } else if (status.payment_status === "waiting" || status.payment_status === "confirming") {
        await ctx.answerCbQuery(
          "⏳ Платёж ещё не подтверждён. Пожалуйста, подождите.",
          { show_alert: true }
        );
      } else {
        await ctx.answerCbQuery(
          `❌ Статус платежа: ${status.payment_status}`,
          { show_alert: true }
        );
      }
    } catch (error) {
      logger.error(undefined, "Error checking payment", error);
      await ctx.answerCbQuery("❌ Ошибка при проверке платежа");
    }
  });

  // Handle payment cancellation
  bot.action("cancel_payment", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "❌ <b>Оплата отменена</b>\n\nВы можете оформить подписку в любое время.",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      logger.error(undefined, "Error canceling payment", error);
    }
  });

  // Handle other currency
  bot.action("pay_other", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `💳 <b>Другие валюты</b>\n\n` +
        `Для оплаты в других криптовалютах, пожалуйста, свяжитесь с поддержкой:\n\n` +
        `📧 support@yourdomain.com`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      logger.error(undefined, "Error in pay_other handler", error);
    }
  });
}
