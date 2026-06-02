import { Bindings } from '../types/env';

/**
 * Sends a notification message to a Telegram Bot.
 * Throttled via KV to avoid spamming the same alert.
 */
export const notifyTelegram = async (message: string, env: Bindings, ctx?: any) => {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  const send = async () => {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (err) {
      console.error('Failed to send Telegram notification:', err);
    }
  };

  // If ctx is provided, use waitUntil to avoid blocking
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(send());
  } else {
    await send();
  }
};

/**
 * Sends an alert only if it hasn't been sent in the last N hours.
 */
export const alertThrottled = async (key: string, message: string, env: Bindings, hours: number = 4, ctx?: any) => {
  if (!env.REPO_REGISTRY) return notifyTelegram(message, env, ctx);

  const kvKey = `alert_sent::${key}`;
  const lastSent = await env.REPO_REGISTRY.get(kvKey);
  
  if (lastSent) {
    const timePassed = Date.now() - parseInt(lastSent, 10);
    if (timePassed < hours * 60 * 60 * 1000) return;
  }

  await env.REPO_REGISTRY.put(kvKey, Date.now().toString(), { expirationTtl: hours * 3600 });
  await notifyTelegram(message, env, ctx);
};
