import { Telegraf } from "telegraf";
import { Context } from "telegraf";
import getMainKeyboard from "../keyboards/main.keyboard";
import paymentService from "../services/payment.service";
import { User } from "../models";
import logger from "../utils/logger";

export default function subscriptionHandlers(bot: Telegraf<Context>) {

  // Handle "Start Trial" button
  bot.action("start_trial", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const userId = ctx.from?.id;
      if (!userId) return;

      const user = await User.findOne({ user_id: userId });
      if (!user) {
        await ctx.editMessageText("❌ <b>Ошибка: пользователь не найден</b>", { parse_mode: "HTML" });
        return;
      }

      const now = new Date();

      // Check if trial already started
      if (user.trial_started_at) {
        await ctx.editMessageText(
          "ℹ️ <b>Триал уже был использован</b>\n\nВы можете оформить платную подписку.",
          { parse_mode: "HTML" }
        );
        return;
      }

      // Start trial
      const trialExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      user.trial_started_at = now;
      user.trial_expires_at = trialExpiry;
      await user.save();

      const { mainKeyboard } = getMainKeyboard();
      await ctx.editMessageText(
        `🎉 <b>Добро пожаловать!</b>\n\n` +
        `✨ Ваш <b>24-часовой триал активирован!</b>\n\n` +
        `У вас теперь полный доступ ко всем функциям бота до <code>${trialExpiry.toLocaleString('ru-RU')}</code>\n\n` +
        `📊 Начните работу с главного меню ⬇️`,
        { parse_mode: "HTML" }
      );

      await ctx.replyWithHTML(
        `<b>Главное меню</b>\n\nВыберите нужный раздел:`,
        mainKeyboard
      );

      logger.info(undefined, `Trial started for user ${userId}`);
    } catch (error) {
      logger.error(undefined, "Error starting trial", error);
      await ctx.answerCbQuery("❌ Произошла ошибка");
    }
  });

  // Handle "Why Paid?" button
  bot.action("why_paid", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      await ctx.editMessageText(
        `💡 <b>Почему подписка платная?</b>\n\n` +
        `Наш бот работает <b>24/7</b> и предоставляет вам мгновенные уведомления о важных событиях на криптовалютных биржах.\n\n` +
        `💸 <b>На что идут средства:</b>\n` +
        `• Серверная инфраструктура и надёжный хостинг\n` +
        `• Постоянная поддержка и мониторинг работы\n` +
        `• Доступ к платным API бирж для получения данных\n` +
        `• Регулярные обновления и новые функции\n` +
        `• Техническая поддержка пользователей\n\n` +
        `💰 Стоимость <b>всего $10/месяц</b> — это символическая плата, которая позволяет нам поддерживать качественный сервис для вас!\n\n` +
        `🎁 Плюс вы получаете <b>бесплатный 24-часовой триал</b>, чтобы убедиться в качестве нашего сервиса!`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 Начать триал", callback_data: "start_trial" }],
              [{ text: "💳 Купить подписку", callback_data: "subscribe" }],
              [{ text: "⬅️ Назад", callback_data: "back_to_start" }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error(undefined, "Error in why_paid handler", error);
    }
  });

  // Handle "Back to Start" button
  bot.action("back_to_start", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      await ctx.editMessageText(
        `<b>👋 Привет!</b>\n\n` +
        `Я - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас о важных событиях!\n\n` +
        `📊 <b>Что я умею:</b>\n` +
        `• Отслеживать изменения <b>открытого интереса (OI)</b>\n` +
        `• Уведомлять о <b>пампах и дампах 📈📉</b>\n` +
        `• Сигнализировать о крупных <b>ликвидациях 💥</b>\n\n` +
        `🎁 <b>Специальное предложение:</b>\n` +
        `При нажатии кнопки <b>"Начать"</b> вы получите <b>БЕСПЛАТНЫЙ 24-часовой доступ</b> ко всем функциям бота!\n\n` +
        `💰 После триала: <b>$10/месяц</b>`,
        {
          parse_markup: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 Начать", callback_data: "start_trial" }],
              [{ text: "💳 Купить подписку", callback_data: "subscribe" }],
              [{ text: "❓ Почему платно?", callback_data: "why_paid" }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error(undefined, "Error in back_to_start handler", error);
    }
  });

  // Handle subscribe button
  bot.action("subscribe", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const userId = ctx.from?.id;
      if (!userId) return;

      const user = await User.findOne({ user_id: userId });
      if (!user) {
        await ctx.editMessageText("❌ <b>Ошибка: пользователь не найден</b>", { parse_mode: "HTML" });
        return;
      }

      const now = new Date();

      // Check if user already has active subscription with more than 7 days remaining
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const daysLeft = Math.ceil((user.subscription_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft > 7) {
          await ctx.editMessageText(
            `✅ <b>У вас уже есть активная подписка!</b>\n\n` +
            `📅 Действует до: <code>${user.subscription_expires_at.toLocaleString('ru-RU')}</code>\n` +
            `⏰ Осталось дней: <b>${daysLeft}</b>\n\n` +
            `💡 Продление подписки станет доступно за 7 дней до окончания текущей.`,
            { parse_mode: "HTML" }
          );
          return;
        }
      }

      await ctx.editMessageText(
        `💳 <b>Оформление подписки</b>\n\n` +
        `Выберите валюту для оплаты:`,
        {
          parse_mode: "HTML",
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
      await ctx.answerCbQuery("❌ Произошла ошибка");
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

        const { mainKeyboard } = getMainKeyboard();
        await ctx.replyWithHTML(
          `<b>Главное меню</b>\n\nВыберите нужный раздел:`,
          mainKeyboard
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
