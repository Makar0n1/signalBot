import { Context } from "telegraf";

export type Language = "ru" | "en";

interface Translations {
  [key: string]: {
    ru: string;
    en: string;
  };
}

const translations: Translations = {
  // Welcome messages
  "welcome.title": {
    ru: "👋 Привет!",
    en: "👋 Hello!"
  },
  "welcome.intro": {
    ru: "Я - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас о важных событиях!",
    en: "I'm <b>Signal Bot 🚀</b>, carefully monitoring exchanges 🌐 and instantly notifying you about important events!"
  },
  "welcome.features.title": {
    ru: "📊 <b>Что я умею:</b>",
    en: "📊 <b>What I can do:</b>"
  },
  "welcome.features.oi": {
    ru: "• Отслеживать изменения <b>открытого интереса (OI)</b>",
    en: "• Track <b>Open Interest (OI)</b> changes"
  },
  "welcome.features.pump": {
    ru: "• Уведомлять о <b>пампах и дампах 📈📉</b>",
    en: "• Notify about <b>pumps and dumps 📈📉</b>"
  },
  "welcome.features.rekt": {
    ru: "• Сигнализировать о крупных <b>ликвидациях 💥</b>",
    en: "• Alert on large <b>liquidations 💥</b>"
  },
  "welcome.trial.title": {
    ru: "🎁 <b>Специальное предложение:</b>",
    en: "🎁 <b>Special Offer:</b>"
  },
  "welcome.trial.text": {
    ru: "При нажатии кнопки <b>\"Начать\"</b> вы получите <b>БЕСПЛАТНЫЙ 24-часовой доступ</b> ко всем функциям бота!",
    en: "Click the <b>\"Start\"</b> button to get <b>FREE 24-hour access</b> to all bot features!"
  },
  "welcome.price": {
    ru: "💰 После триала: <b>$25/месяц</b>",
    en: "💰 After trial: <b>$25/month</b>"
  },

  // Buttons
  "btn.start_trial": {
    ru: "🚀 Начать",
    en: "🚀 Start"
  },
  "btn.subscribe": {
    ru: "💳 Купить подписку",
    en: "💳 Buy Subscription"
  },
  "btn.why_paid": {
    ru: "❓ Почему платно?",
    en: "❓ Why Paid?"
  },
  "btn.back": {
    ru: "⬅️ Назад",
    en: "⬅️ Back"
  },
  "btn.cancel": {
    ru: "❌ Отменить",
    en: "❌ Cancel"
  },
  "btn.paid": {
    ru: "✅ Я оплатил",
    en: "✅ I Paid"
  },

  // Trial messages
  "trial.activated.title": {
    ru: "🎉 <b>Добро пожаловать!</b>",
    en: "🎉 <b>Welcome!</b>"
  },
  "trial.activated.text": {
    ru: "✨ Ваш <b>24-часовой триал активирован!</b>",
    en: "✨ Your <b>24-hour trial is activated!</b>"
  },
  "trial.activated.access": {
    ru: "У вас теперь полный доступ ко всем функциям бота до",
    en: "You now have full access to all bot features until"
  },
  "trial.activated.start": {
    ru: "📊 Начните работу с главного меню ⬇️",
    en: "📊 Start working with the main menu ⬇️"
  },
  "trial.already_used": {
    ru: "ℹ️ <b>Триал уже был использован</b>\n\nВы можете оформить платную подписку.",
    en: "ℹ️ <b>Trial already used</b>\n\nYou can purchase a paid subscription."
  },
  "trial.has_subscription": {
    ru: "✅ <b>У вас уже есть активная подписка!</b>\n\nТриал вам не нужен 😊",
    en: "✅ <b>You already have an active subscription!</b>\n\nYou don't need a trial 😊"
  },
  "trial.expired": {
    ru: "⏰ <b>Триал период истёк!</b>\n\nДля продолжения работы с ботом необходимо оформить подписку.\n\n💰 Стоимость: <b>25$ в месяц</b>\n💳 Оплата принимается в криптовалюте",
    en: "⏰ <b>Trial period expired!</b>\n\nTo continue using the bot, you need to subscribe.\n\n💰 Price: <b>$25/month</b>\n💳 Cryptocurrency payment accepted"
  },

  // Payment messages
  "payment.title": {
    ru: "💳 <b>Платёжная информация</b>",
    en: "💳 <b>Payment Information</b>"
  },
  "payment.amount": {
    ru: "💰 Сумма:",
    en: "💰 Amount:"
  },
  "payment.address": {
    ru: "📬 Адрес для оплаты:",
    en: "📬 Payment address:"
  },
  "payment.important": {
    ru: "⚠️ <b>Важно:</b> Отправьте точную сумму на указанный адрес. После подтверждения транзакции ваша подписка будет активирована автоматически.",
    en: "⚠️ <b>Important:</b> Send the exact amount to the specified address. Your subscription will be activated automatically after transaction confirmation."
  },
  "payment.time": {
    ru: "⏰ Время на оплату: 60 минут",
    en: "⏰ Payment time: 60 minutes"
  },
  "payment.id": {
    ru: "🔍 ID платежа:",
    en: "🔍 Payment ID:"
  },
  "payment.confirmed": {
    ru: "✅ <b>Платёж подтверждён!</b>\n\nСпасибо за покупку подписки! Ваш доступ к боту активирован на 30 дней.\n\n🎉 Приятного использования!",
    en: "✅ <b>Payment confirmed!</b>\n\nThank you for purchasing a subscription! Your bot access is activated for 30 days.\n\n🎉 Enjoy using it!"
  },
  "payment.failed": {
    ru: "❌ <b>Платёж не удался</b>\n\nК сожалению, ваш платёж не был завершён. Вы можете попробовать снова.\n\nДля оформления подписки нажмите /start",
    en: "❌ <b>Payment failed</b>\n\nUnfortunately, your payment was not completed. You can try again.\n\nTo subscribe, press /start"
  },
  "payment.expired": {
    ru: "❌ <b>Платёж истёк</b>\n\nК сожалению, ваш платёж не был завершён. Вы можете попробовать снова.\n\nДля оформления подписки нажмите /start",
    en: "❌ <b>Payment expired</b>\n\nUnfortunately, your payment was not completed. You can try again.\n\nTo subscribe, press /start"
  },
  "payment.error": {
    ru: "❌ <b>Ошибка при создании платежа</b>\n\nК сожалению, не удалось создать платёж. Пожалуйста, попробуйте позже.\n\nВы можете выбрать другой способ оплаты или связаться с поддержкой.",
    en: "❌ <b>Error creating payment</b>\n\nUnfortunately, the payment could not be created. Please try later.\n\nYou can choose another payment method or contact support."
  },

  // Main menu
  "menu.main": {
    ru: "<b>Главное меню</b>\n\nВыберите нужный раздел:",
    en: "<b>Main Menu</b>\n\nChoose a section:"
  },
  "menu.bot_intro": {
    ru: "<b>Я - Сигнал Бот 🚀</b>\n\nВнимательно слежу за биржами 🌐 и мгновенно оповещаю вас о важных событиях!\n\n<b>Главное меню ⬇️</b>",
    en: "<b>I'm Signal Bot 🚀</b>\n\nCarefully monitoring exchanges 🌐 and instantly notifying you about important events!\n\n<b>Main menu ⬇️</b>"
  },

  // Admin messages
  "admin.welcome": {
    ru: "<b>👋 Привет, Админ!</b>\n\nЯ - <b>Сигнал Бот 🚀</b>, который внимательно следит за биржами 🌐 и мгновенно оповещает вас, когда произойдут важные события, такие как изменение <b>открытого интереса</b>, <b>памп 📈</b> или <b>ликвидация 💥</b> всех криптовалютных пар! 💹\n\n<b>Главное меню ⬇️</b>",
    en: "<b>👋 Hello, Admin!</b>\n\nI'm <b>Signal Bot 🚀</b>, carefully monitoring exchanges 🌐 and instantly notifying you when important events occur, such as changes in <b>open interest</b>, <b>pump 📈</b> or <b>liquidation 💥</b> of all cryptocurrency pairs! 💹\n\n<b>Main menu ⬇️</b>"
  },

  // Errors
  "error.user_not_found": {
    ru: "❌ <b>Ошибка: пользователь не найден</b>",
    en: "❌ <b>Error: user not found</b>"
  },
  "error.user_create": {
    ru: "❌ <b>Ошибка при создании пользователя</b>",
    en: "❌ <b>Error creating user</b>"
  },
};

/**
 * Detect user language from Telegram context
 */
export function getUserLanguage(ctx: Context): Language {
  // Try to get language from user's Telegram settings
  const langCode = ctx.from?.language_code;

  // If Russian, return ru, otherwise default to en
  if (langCode && langCode.startsWith("ru")) {
    return "ru";
  }

  return "en";
}

/**
 * Get translated text by key
 */
export function t(key: string, lang: Language): string {
  const translation = translations[key];

  if (!translation) {
    console.error(`Translation not found for key: ${key}`);
    return key;
  }

  return translation[lang] || translation.en || key;
}

/**
 * Helper to get translated text from context
 */
export function tc(ctx: Context, key: string): string {
  const lang = getUserLanguage(ctx);
  return t(key, lang);
}

export default { t, tc, getUserLanguage };
