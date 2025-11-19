import { Telegraf } from "telegraf";
import { Context } from "telegraf";
import getMainKeyboard from "../keyboards/main.keyboard";
import paymentService from "../services/payment.service";
import { User } from "../models";
import logger from "../utils/logger";
import { tc, getUserLanguage, t } from "../utils/i18n";

export default function subscriptionHandlers(bot: Telegraf<Context>) {

  // Handle "Start Trial" button
  bot.action("start_trial", async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const userId = ctx.from?.id;
      if (!userId) return;

      const user = await User.findOne({ user_id: userId });
      if (!user) {
        await ctx.editMessageText(tc(ctx, "error.user_not_found"), { parse_mode: "HTML" });
        return;
      }

      const now = new Date();
      const lang = getUserLanguage(ctx);

      // Check if trial already started OR if user already has active subscription
      if (user.trial_started_at) {
        const { mainKeyboard } = getMainKeyboard();
        await ctx.editMessageText(
          tc(ctx, "trial.already_used"),
          { parse_mode: "HTML" }
        );
        await ctx.replyWithHTML(
          tc(ctx, "menu.main"),
          mainKeyboard
        );
        return;
      }

      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const { mainKeyboard } = getMainKeyboard();
        await ctx.editMessageText(
          tc(ctx, "trial.has_subscription"),
          { parse_mode: "HTML" }
        );
        await ctx.replyWithHTML(
          tc(ctx, "menu.main"),
          mainKeyboard
        );
        return;
      }

      // Start trial
      const trialExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      user.trial_started_at = now;
      user.trial_expires_at = trialExpiry;
      await user.save();

      const { mainKeyboard } = getMainKeyboard();

      const trialMessage = `${tc(ctx, "trial.activated.title")}\n\n` +
        `${tc(ctx, "trial.activated.text")}\n\n` +
        `${tc(ctx, "trial.activated.access")} <code>${trialExpiry.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}</code>\n\n` +
        `${tc(ctx, "trial.activated.start")}\n\n` +
        `${tc(ctx, "menu.bot_intro")}`;

      try {
        // Delete the inline keyboard message
        await ctx.deleteMessage();
      } catch (e) {
        // If delete fails, just continue
      }

      // Send new message with main keyboard
      await ctx.replyWithHTML(
        trialMessage,
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

      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";
      const lang = getUserLanguage(ctx);

      await ctx.editMessageText(
        `💡 <b>${lang === 'ru' ? 'Почему подписка платная?' : 'Why is it paid?'}</b>\n\n` +
        `${lang === 'ru'
          ? `Наш бот работает <b>24/7</b> и предоставляет вам мгновенные уведомления о важных событиях на криптовалютных биржах.\n\n` +
            `💸 <b>На что идут средства:</b>\n` +
            `• Серверная инфраструктура и надёжный хостинг\n` +
            `• Постоянная поддержка и мониторинг работы\n` +
            `• Доступ к платным API бирж для получения данных\n` +
            `• Регулярные обновления и новые функции\n` +
            `• Техническая поддержка пользователей\n\n` +
            `💰 Стоимость <b>всего $${price}/месяц</b> — это символическая плата, которая позволяет нам поддерживать качественный сервис для вас!\n\n` +
            `🎁 Плюс вы получаете <b>бесплатный 24-часовой триал</b>, чтобы убедиться в качестве нашего сервиса!`
          : `Our bot works <b>24/7</b> and provides instant notifications about important events on crypto exchanges.\n\n` +
            `💸 <b>What the funds go towards:</b>\n` +
            `• Server infrastructure and reliable hosting\n` +
            `• Constant support and monitoring\n` +
            `• Access to paid exchange APIs for data\n` +
            `• Regular updates and new features\n` +
            `• User technical support\n\n` +
            `💰 Price <b>only $${price}/month</b> — a symbolic fee that allows us to maintain quality service for you!\n\n` +
            `🎁 Plus you get a <b>free 24-hour trial</b> to verify our service quality!`
        }`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: tc(ctx, "btn.start_trial"), callback_data: "start_trial" }],
              [{ text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }],
              [{ text: tc(ctx, "btn.back"), callback_data: "back_to_start" }]
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

      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";

      const welcomeMessage =
        `${tc(ctx, "welcome.title")}\n\n` +
        `${tc(ctx, "welcome.intro")}\n\n` +
        `${tc(ctx, "welcome.features.title")}\n` +
        `${tc(ctx, "welcome.features.oi")}\n` +
        `${tc(ctx, "welcome.features.pump")}\n` +
        `${tc(ctx, "welcome.features.rekt")}\n\n` +
        `${tc(ctx, "welcome.trial.title")}\n` +
        `${tc(ctx, "welcome.trial.text")}\n\n` +
        `💰 ${getUserLanguage(ctx) === 'ru' ? `После триала: <b>$${price}/месяц</b>` : `After trial: <b>$${price}/month</b>`}`;

      await ctx.editMessageText(
        welcomeMessage,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: tc(ctx, "btn.start_trial"), callback_data: "start_trial" }],
              [{ text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }],
              [{ text: tc(ctx, "btn.why_paid"), callback_data: "why_paid" }]
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

  Object.entries(paymentHandlers).forEach(([action, payCurrency]) => {
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
          currency: "usd",
          pay_currency: payCurrency
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

        // Return to start menu on error
        await ctx.editMessageText(
          `❌ <b>Ошибка при создании платежа</b>\n\n` +
          `К сожалению, не удалось создать платёж. Пожалуйста, попробуйте позже.\n\n` +
          `Вы можете выбрать другой способ оплаты или связаться с поддержкой.`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Попробовать снова", callback_data: "subscribe" }],
                [{ text: "⬅️ Вернуться к началу", callback_data: "back_to_start" }]
              ]
            }
          }
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
        // Delete the payment message
        try {
          await ctx.deleteMessage();
        } catch (e) {
          // If delete fails, try to edit the message
          await ctx.editMessageText(
            `✅ <b>Платёж подтверждён!</b>\n\n` +
            `Спасибо за покупку подписки! Ваш доступ к боту активирован на 30 дней.\n\n` +
            `🎉 Приятного использования!`,
            { parse_mode: "HTML" }
          );
        }

        // Send success message with main keyboard
        const { mainKeyboard } = getMainKeyboard();
        const lang = getUserLanguage(ctx);

        await ctx.replyWithHTML(
          `✅ <b>${lang === 'ru' ? 'Платёж получен!' : 'Payment received!'}</b>\n\n` +
          `${lang === 'ru' ? 'Приятного пользования!' : 'Enjoy using the bot!'}\n\n` +
          `${tc(ctx, "menu.bot_intro")}`,
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

      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";

      const welcomeMessage =
        `${tc(ctx, "welcome.title")}\n\n` +
        `${tc(ctx, "welcome.intro")}\n\n` +
        `${tc(ctx, "welcome.features.title")}\n` +
        `${tc(ctx, "welcome.features.oi")}\n` +
        `${tc(ctx, "welcome.features.pump")}\n` +
        `${tc(ctx, "welcome.features.rekt")}\n\n` +
        `${tc(ctx, "welcome.trial.title")}\n` +
        `${tc(ctx, "welcome.trial.text")}\n\n` +
        `💰 ${getUserLanguage(ctx) === 'ru' ? `После триала: <b>$${price}/месяц</b>` : `After trial: <b>$${price}/month</b>`}`;

      await ctx.editMessageText(
        welcomeMessage,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: tc(ctx, "btn.start_trial"), callback_data: "start_trial" }],
              [{ text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }],
              [{ text: tc(ctx, "btn.why_paid"), callback_data: "why_paid" }]
            ]
          }
        }
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
        `📱 @mike7330`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ Вернуться к началу", callback_data: "back_to_start" }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error(undefined, "Error in pay_other handler", error);
    }
  });
}
