import { Telegraf } from "telegraf";
import { Context } from "telegraf";
import getMainKeyboard from "../keyboards/main.keyboard";
import paymentService from "../services/payment.service";
import { User } from "../models";
import logger from "../utils/logger";
import { tc, getUserLanguage, t } from "../utils/i18n";
import userCacheService from "../services/user-cache.service";

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
        const { mainKeyboard } = getMainKeyboard(lang);
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
        const { mainKeyboard } = getMainKeyboard(lang);
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

      // Start trial (5 minutes for testing)
      const trialExpiry = new Date(now.getTime() + 30 * 60 * 1000);
      user.trial_started_at = now;
      user.trial_expires_at = trialExpiry;
      user.trial_expiry_notified = false; // Reset notification flag
      await user.save();

      // Инвалидировать кэш пользователя после старта триала
      await userCacheService.invalidate(userId);

      const { mainKeyboard } = getMainKeyboard(lang);

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
      const lang = getUserLanguage(ctx);
      await ctx.answerCbQuery(lang === 'ru' ? "❌ Произошла ошибка" : "❌ An error occurred");
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
      const lang = getUserLanguage(ctx);

      const welcomeMessage =
        `${tc(ctx, "welcome.title")}\n\n` +
        `${tc(ctx, "welcome.intro")}\n\n` +
        `${tc(ctx, "welcome.features.title")}\n` +
        `${tc(ctx, "welcome.features.oi")}\n` +
        `${tc(ctx, "welcome.features.pump")}\n` +
        `${tc(ctx, "welcome.features.rekt")}\n\n` +
        `${tc(ctx, "welcome.trial.title")}\n` +
        `${tc(ctx, "welcome.trial.text")}\n\n` +
        `💰 ${lang === 'ru' ? `После триала: <b>$${price}/месяц</b>` : `After trial: <b>$${price}/month</b>`}`;

      await ctx.editMessageText(
        welcomeMessage,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: tc(ctx, "btn.start_trial"), callback_data: "start_trial" }],
              [{ text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }],
              [{ text: tc(ctx, "btn.why_paid"), callback_data: "why_paid" }],
              [{ text: "🌐 Language / Язык", callback_data: "select_language" }]
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
        await ctx.editMessageText(tc(ctx, "error.user_not_found"), { parse_mode: "HTML" });
        return;
      }

      const now = new Date();
      const lang = getUserLanguage(ctx);
      const locale = lang === 'ru' ? 'ru-RU' : 'en-US';

      // Check if user already has active subscription with more than 7 days remaining
      if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
        const daysLeft = Math.ceil((user.subscription_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft > 7) {
          const alreadyActiveMsg = lang === 'ru'
            ? `✅ <b>У вас уже есть активная подписка!</b>\n\n` +
              `📅 Действует до: <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n` +
              `⏰ Осталось дней: <b>${daysLeft}</b>\n\n` +
              `💡 Продление подписки станет доступно за 7 дней до окончания текущей.`
            : `✅ <b>You already have an active subscription!</b>\n\n` +
              `📅 Valid until: <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n` +
              `⏰ Days left: <b>${daysLeft}</b>\n\n` +
              `💡 Renewal will be available 7 days before the current subscription expires.`;

          await ctx.editMessageText(alreadyActiveMsg, { parse_mode: "HTML" });
          return;
        }
      }

      const subscribeTitle = lang === 'ru' ? `💳 <b>Оформление подписки</b>\n\nВыберите валюту для оплаты:` : `💳 <b>Subscribe</b>\n\nSelect payment currency:`;
      const otherCurrency = lang === 'ru' ? "💵 Другая валюта" : "💵 Other Currency";
      const cancelBtn = lang === 'ru' ? "❌ Отмена" : "❌ Cancel";

      await ctx.editMessageText(
        subscribeTitle,
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
                { text: otherCurrency, callback_data: "pay_other" }
              ],
              [
                { text: cancelBtn, callback_data: "cancel_payment" }
              ]
            ]
          }
        }
      );
    } catch (error) {
      logger.error(undefined, "Error in subscribe handler", error);
      const lang = getUserLanguage(ctx);
      await ctx.answerCbQuery(lang === 'ru' ? "❌ Произошла ошибка" : "❌ An error occurred");
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
        const lang = getUserLanguage(ctx);
        await ctx.answerCbQuery(lang === 'ru' ? "⏳ Создаём платёж..." : "⏳ Creating payment...");

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

        const paymentInfoMsg = lang === 'ru'
          ? `💳 <b>Платёжная информация</b>\n\n` +
            `💰 Сумма: <code>${payment.pay_amount} ${payment.pay_currency.toUpperCase()}</code>\n` +
            `📬 Адрес для оплаты:\n<code>${payment.pay_address}</code>\n\n` +
            `⚠️ <b>Важно:</b> Отправьте точную сумму на указанный адрес. После подтверждения транзакции ваша подписка будет активирована автоматически.\n\n` +
            `⏰ Время на оплату: 60 минут\n\n` +
            `🔍 ID платежа: <code>${payment.payment_id}</code>`
          : `💳 <b>Payment Information</b>\n\n` +
            `💰 Amount: <code>${payment.pay_amount} ${payment.pay_currency.toUpperCase()}</code>\n` +
            `📬 Payment address:\n<code>${payment.pay_address}</code>\n\n` +
            `⚠️ <b>Important:</b> Send the exact amount to the specified address. Your subscription will be activated automatically after transaction confirmation.\n\n` +
            `⏰ Payment time: 60 minutes\n\n` +
            `🔍 Payment ID: <code>${payment.payment_id}</code>`;

        await ctx.editMessageText(
          paymentInfoMsg,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: lang === 'ru' ? "✅ Я оплатил" : "✅ I Paid", callback_data: `check_payment_${payment.payment_id}` }
                ],
                [
                  { text: lang === 'ru' ? "❌ Отменить" : "❌ Cancel", callback_data: "cancel_payment" }
                ]
              ]
            }
          }
        );

        logger.info(undefined, `Payment created for user ${userId}: ${payment.payment_id}`);
      } catch (error) {
        logger.error(undefined, "Error creating payment", error);
        const lang = getUserLanguage(ctx);

        const errorMsg = lang === 'ru'
          ? `❌ <b>Ошибка при создании платежа</b>\n\n` +
            `К сожалению, не удалось создать платёж. Пожалуйста, попробуйте позже.\n\n` +
            `Вы можете выбрать другой способ оплаты или связаться с поддержкой.`
          : `❌ <b>Payment Creation Error</b>\n\n` +
            `Unfortunately, the payment could not be created. Please try again later.\n\n` +
            `You can choose a different payment method or contact support.`;

        // Return to start menu on error
        await ctx.editMessageText(
          errorMsg,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: lang === 'ru' ? "🔄 Попробовать снова" : "🔄 Try Again", callback_data: "subscribe" }],
                [{ text: lang === 'ru' ? "⬅️ Вернуться к началу" : "⬅️ Back to Start", callback_data: "back_to_start" }]
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
      const lang = getUserLanguage(ctx);
      await ctx.answerCbQuery(lang === 'ru' ? "⏳ Проверяем статус платежа..." : "⏳ Checking payment status...");

      const paymentId = ctx.match[1];
      const status = await paymentService.getPaymentStatus(paymentId);

      if (status.payment_status === "finished" || status.payment_status === "confirmed") {
        // Delete the payment message
        try {
          await ctx.deleteMessage();
        } catch (e) {
          // If delete fails, try to edit the message
          const confirmedMsg = lang === 'ru'
            ? `✅ <b>Платёж подтверждён!</b>\n\nСпасибо за покупку подписки! Ваш доступ к боту активирован на 30 дней.\n\n🎉 Приятного использования!`
            : `✅ <b>Payment Confirmed!</b>\n\nThank you for purchasing a subscription! Your bot access is activated for 30 days.\n\n🎉 Enjoy!`;
          await ctx.editMessageText(confirmedMsg, { parse_mode: "HTML" });
        }

        // Send success message with main keyboard
        const { mainKeyboard } = getMainKeyboard(lang);

        await ctx.replyWithHTML(
          `✅ <b>${lang === 'ru' ? 'Платёж получен!' : 'Payment received!'}</b>\n\n` +
          `${lang === 'ru' ? 'Приятного пользования!' : 'Enjoy using the bot!'}\n\n` +
          `${tc(ctx, "menu.bot_intro")}`,
          mainKeyboard
        );
      } else if (status.payment_status === "waiting" || status.payment_status === "confirming") {
        await ctx.answerCbQuery(
          lang === 'ru' ? "⏳ Платёж ещё не подтверждён. Пожалуйста, подождите." : "⏳ Payment not confirmed yet. Please wait.",
          { show_alert: true }
        );
      } else {
        await ctx.answerCbQuery(
          `❌ ${lang === 'ru' ? 'Статус платежа' : 'Payment status'}: ${status.payment_status}`,
          { show_alert: true }
        );
      }
    } catch (error) {
      logger.error(undefined, "Error checking payment", error);
      const lang = getUserLanguage(ctx);
      await ctx.answerCbQuery(lang === 'ru' ? "❌ Ошибка при проверке платежа" : "❌ Error checking payment");
    }
  });

  // Handle payment cancellation
  bot.action("cancel_payment", async (ctx) => {
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
      const price = process.env.SUBSCRIPTION_PRICE_USD || "25";
      const lang = getUserLanguage(ctx);
      const locale = lang === 'ru' ? 'ru-RU' : 'en-US';

      // Check if user has trial/subscription history
      const hasHistory = user.trial_started_at || user.subscription_expires_at;

      if (hasHistory) {
        // Return to "My Subscriptions" page content

        // Check if user is admin
        if (user.is_admin) {
          await ctx.editMessageText(
            lang === 'ru'
              ? `👑 <b>Статус подписки: Администратор</b>\n\nУ вас полный неограниченный доступ ко всем функциям бота!`
              : `👑 <b>Subscription Status: Administrator</b>\n\nYou have full unlimited access to all bot features!`,
            { parse_mode: "HTML" }
          );
          return;
        }

        // Check if user has active subscription
        if (user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > now) {
          const daysLeft = Math.ceil((user.subscription_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const canRenew = daysLeft <= 7;

          const activeSubMsg = lang === 'ru'
            ? `✅ <b>Подписка активна</b>\n\n` +
              `📅 Действует до: <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n` +
              `⏰ Осталось дней: <b>${daysLeft}</b>\n\n` +
              `💰 Стоимость продления: <b>$${price}/месяц</b>` +
              (canRenew ? "\n\n💡 Вы можете продлить подписку уже сейчас!" : "\n\n💡 Продление станет доступно за 7 дней до окончания.")
            : `✅ <b>Subscription Active</b>\n\n` +
              `📅 Valid until: <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n` +
              `⏰ Days left: <b>${daysLeft}</b>\n\n` +
              `💰 Renewal price: <b>$${price}/month</b>` +
              (canRenew ? "\n\n💡 You can renew your subscription now!" : "\n\n💡 Renewal will be available 7 days before expiration.");

          await ctx.editMessageText(
            activeSubMsg,
            canRenew ? {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: lang === 'ru' ? "💳 Продлить подписку" : "💳 Renew Subscription", callback_data: "subscribe" }
                ]]
              }
            } : { parse_mode: "HTML" }
          );
          return;
        }

        // Check if trial is active
        if (user.trial_expires_at && user.trial_expires_at > now) {
          const hoursLeft = Math.ceil((user.trial_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60));

          const trialActiveMsg = lang === 'ru'
            ? `🎁 <b>Триал активен</b>\n\n` +
              `📅 Действует до: <code>${user.trial_expires_at.toLocaleString(locale)}</code>\n` +
              `⏰ Осталось часов: <b>${hoursLeft}</b>\n\n` +
              `💡 После окончания триала вы можете оформить подписку за <b>$${price}/месяц</b>`
            : `🎁 <b>Trial Active</b>\n\n` +
              `📅 Valid until: <code>${user.trial_expires_at.toLocaleString(locale)}</code>\n` +
              `⏰ Hours left: <b>${hoursLeft}</b>\n\n` +
              `💡 After the trial ends, you can subscribe for <b>$${price}/month</b>`;

          await ctx.editMessageText(
            trialActiveMsg,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }
                ]]
              }
            }
          );
          return;
        }

        // Check if subscription has expired
        if (user.subscription_expires_at && user.subscription_expires_at <= now) {
          const subExpiredMsg = lang === 'ru'
            ? `⏰ <b>Ваша подписка окончилась</b>\n\n` +
              `📅 Окончилась: <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n\n` +
              `Пожалуйста, оплатите подписку, чтобы продолжить получать сигналы.\n\n` +
              `💰 Стоимость: <b>$${price}/месяц</b>\n` +
              `💳 Оплата принимается в криптовалюте`
            : `⏰ <b>Your subscription has expired</b>\n\n` +
              `📅 Expired: <code>${user.subscription_expires_at.toLocaleString(locale)}</code>\n\n` +
              `Please subscribe to continue receiving signals.\n\n` +
              `💰 Price: <b>$${price}/month</b>\n` +
              `💳 Cryptocurrency payment accepted`;

          await ctx.editMessageText(
            subExpiredMsg,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: lang === 'ru' ? "💳 Продлить подписку" : "💳 Renew Subscription", callback_data: "subscribe" }
                ]]
              }
            }
          );
          return;
        }

        // Check if trial has expired
        if (user.trial_expires_at && user.trial_expires_at <= now) {
          const trialExpiredMsg = lang === 'ru'
            ? `⏰ <b>Ваш триал период окончен</b>\n\n` +
              `📅 Окончился: <code>${user.trial_expires_at.toLocaleString(locale)}</code>\n\n` +
              `Пожалуйста, оплатите подписку, чтобы вновь получать сигналы.\n\n` +
              `💰 Стоимость: <b>$${price}/месяц</b>\n` +
              `💳 Оплата принимается в криптовалюте`
            : `⏰ <b>Your trial period has ended</b>\n\n` +
              `📅 Ended: <code>${user.trial_expires_at.toLocaleString(locale)}</code>\n\n` +
              `Please subscribe to continue receiving signals.\n\n` +
              `💰 Price: <b>$${price}/month</b>\n` +
              `💳 Cryptocurrency payment accepted`;

          await ctx.editMessageText(
            trialExpiredMsg,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }
                ]]
              }
            }
          );
          return;
        }

        // User has history but no active/expired subscription or trial - fallback to subscription page
        const inactiveMsg = lang === 'ru'
          ? `⏰ <b>Подписка не активна</b>\n\n` +
            `Для продолжения работы с ботом необходимо оформить подписку.\n\n` +
            `💰 Стоимость: <b>$${price}/месяц</b>\n` +
            `💳 Оплата принимается в криптовалюте`
          : `⏰ <b>Subscription Inactive</b>\n\n` +
            `To continue using the bot, you need to subscribe.\n\n` +
            `💰 Price: <b>$${price}/month</b>\n` +
            `💳 Cryptocurrency payment accepted`;

        await ctx.editMessageText(
          inactiveMsg,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[
                { text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }
              ]]
            }
          }
        );
      } else {
        // New user without history - return to welcome page
        const welcomeMessage =
          `${tc(ctx, "welcome.title")}\n\n` +
          `${tc(ctx, "welcome.intro")}\n\n` +
          `${tc(ctx, "welcome.features.title")}\n` +
          `${tc(ctx, "welcome.features.oi")}\n` +
          `${tc(ctx, "welcome.features.pump")}\n` +
          `${tc(ctx, "welcome.features.rekt")}\n\n` +
          `${tc(ctx, "welcome.trial.title")}\n` +
          `${tc(ctx, "welcome.trial.text")}\n\n` +
          `💰 ${lang === 'ru' ? `После триала: <b>$${price}/месяц</b>` : `After trial: <b>$${price}/month</b>`}`;

        await ctx.editMessageText(
          welcomeMessage,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: tc(ctx, "btn.start_trial"), callback_data: "start_trial" }],
                [{ text: tc(ctx, "btn.subscribe"), callback_data: "subscribe" }],
                [{ text: tc(ctx, "btn.why_paid"), callback_data: "why_paid" }],
                [{ text: "🌐 Language / Язык", callback_data: "select_language" }]
              ]
            }
          }
        );
      }
    } catch (error) {
      logger.error(undefined, "Error canceling payment", error);
    }
  });

  // Handle other currency
  bot.action("pay_other", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const lang = getUserLanguage(ctx);

      const otherCurrencyMsg = lang === 'ru'
        ? `💳 <b>Другие валюты</b>\n\nДля оплаты в других криптовалютах, пожалуйста, свяжитесь с поддержкой:\n\n📱 @mike7330`
        : `💳 <b>Other Currencies</b>\n\nFor payment in other cryptocurrencies, please contact support:\n\n📱 @mike7330`;

      await ctx.editMessageText(
        otherCurrencyMsg,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: lang === 'ru' ? "⬅️ Вернуться к началу" : "⬅️ Back to Start", callback_data: "back_to_start" }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error(undefined, "Error in pay_other handler", error);
    }
  });
}
