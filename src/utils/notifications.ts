import { Bindings } from '../types/env';

// In-memory throttle map (per-isolate, resets on cold start)
const alertThrottleCache = new Map<string, number>();

/**
 * Sends a notification message to a Telegram Bot.
 */
// @lat: [[notifications]]
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
 * Uses in-memory throttle — no KV dependency.
 */
export const alertThrottled = async (key: string, message: string, env: Bindings, hours: number = 4, ctx?: any) => {
  const now = Date.now();
  const lastSent = alertThrottleCache.get(key);

  if (lastSent) {
    const timePassed = now - lastSent;
    if (timePassed < hours * 60 * 60 * 1000) return;
  }

  alertThrottleCache.set(key, now);
  await notifyTelegram(message, env, ctx);
};