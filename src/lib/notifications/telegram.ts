import type { Listing } from '@/lib/supabase/types';

const TELEGRAM_MAX_LENGTH = 4096;
const HEADER_OVERHEAD = 80;
const MSG_SEPARATOR = '\n\n';

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable');
  }
  return token;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  const token = getBotToken();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(
      `[Telegram] API error ${res.status}:`,
      body.description ?? JSON.stringify(body),
    );
    return false;
  }

  return true;
}

/**
 * Format a listing into a Telegram-friendly message.
 */
export function formatListingMessage(listing: Listing): string {
  const lines = [
    `🏠 *${listing.title}*`,
    '',
    listing.price ? `💰 Cijena: ${listing.price}` : null,
    listing.size_m2 ? `📐 Veličina: ${listing.size_m2} m²` : null,
    listing.location ? `📍 Lokacija: ${listing.location}` : null,
    listing.property_type ? `🏗️ Tip: ${listing.property_type}` : null,
    listing.advertiser_type
      ? `👤 Oglašivač: ${listing.advertiser_type}`
      : null,
    '',
    `🔗 ${listing.url}`,
  ];

  return lines.filter(Boolean).join('\n');
}

/**
 * Split matched listing messages into batches that each fit within
 * Telegram's 4096-char limit, then send each batch as a separate message.
 */
export async function sendAgentNotification(
  matchedMessages: string[],
  chatId: string,
): Promise<boolean> {
  if (matchedMessages.length === 0) return true;

  try {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentLength = HEADER_OVERHEAD;

    for (const msg of matchedMessages) {
      const addition = msg.length + MSG_SEPARATOR.length;
      if (
        currentLength + addition > TELEGRAM_MAX_LENGTH &&
        currentBatch.length > 0
      ) {
        batches.push(currentBatch);
        currentBatch = [];
        currentLength = HEADER_OVERHEAD;
      }
      currentBatch.push(msg);
      currentLength += addition;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    for (let i = 0; i < batches.length; i++) {
      const header =
        batches.length > 1
          ? `🎯 *Nove prilike (${i + 1}/${batches.length})*`
          : `🎯 *Nove prilike za vaše kupce!*`;

      const body = [header, '', ...batches[i]].join(MSG_SEPARATOR);
      const sent = await sendTelegramMessage(chatId, body);
      if (!sent) return false;
    }

    console.log(
      `[Telegram] Notification sent (${matchedMessages.length} matches, ${batches.length} message(s)) to chat ${chatId}`,
    );
    return true;
  } catch (error) {
    const err = error as { message?: string };
    console.error(`[Telegram] Failed to send notification:`, err.message);
    return false;
  }
}
