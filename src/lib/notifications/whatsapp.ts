import type { Listing } from "@/lib/supabase/types";

// Twilio WhatsApp notification service
// Lazy initialization to prevent build-time errors when Twilio is not configured

let twilioClient: ReturnType<typeof import("twilio")> | null = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN environment variables"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require("twilio");
  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

/**
 * Format a listing into a WhatsApp-friendly message
 */
function formatListingMessage(listing: Listing): string {
  const lines = [
    `🏠 *${listing.title}*`,
    "",
    listing.price ? `💰 Cijena: ${listing.price}` : null,
    listing.size_m2 ? `📐 Veličina: ${listing.size_m2} m²` : null,
    listing.location ? `📍 Lokacija: ${listing.location}` : null,
    listing.property_type ? `🏗️ Tip: ${listing.property_type}` : null,
    listing.advertiser_type
      ? `👤 Oglašivač: ${listing.advertiser_type}`
      : null,
    "",
    `🔗 ${listing.url}`,
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * Send a WhatsApp notification for a new listing
 */
export async function sendNewListingNotification(
  listing: Listing,
  toPhoneNumber: string
): Promise<boolean> {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).messages.create({
      body: formatListingMessage(listing),
      from: fromNumber,
      to: `whatsapp:${toPhoneNumber}`,
    });

    console.log(
      `[WhatsApp] Notification sent for listing ${listing.external_id} to ${toPhoneNumber}`
    );
    return true;
  } catch (error) {
    const err = error as { code?: number; message?: string };
    console.error(
      `[WhatsApp] Failed to send notification: code=${err.code}`,
      err.message,
    );
    return false;
  }
}

const WHATSAPP_MAX_LENGTH = 1500; // safety margin below Twilio's 1600 limit
const HEADER_OVERHEAD = 60; // space reserved for the header line + separators
const MSG_SEPARATOR = "\n\n";

/**
 * Split matched listing messages into batches that each fit within
 * WhatsApp's character limit, then send each batch as a separate message.
 */
export async function sendAgentNotification(
  matchedMessages: string[],
  toPhoneNumber: string,
): Promise<boolean> {
  if (matchedMessages.length === 0) return true;

  try {
    const client = getTwilioClient();
    const fromNumber =
      process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentLength = HEADER_OVERHEAD;

    for (const msg of matchedMessages) {
      const addition = msg.length + MSG_SEPARATOR.length;
      if (currentLength + addition > WHATSAPP_MAX_LENGTH && currentBatch.length > 0) {
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

      const body = [header, "", ...batches[i]].join(MSG_SEPARATOR);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).messages.create({
        body,
        from: fromNumber,
        to: `whatsapp:${toPhoneNumber}`,
      });
    }

    console.log(
      `[WhatsApp] Agent notification sent (${matchedMessages.length} matches, ${batches.length} message(s)) to ${toPhoneNumber}`,
    );
    return true;
  } catch (error) {
    const err = error as { code?: number; message?: string };
    console.error(
      `[WhatsApp] Failed to send agent notification: code=${err.code}`,
      err.message,
    );
    return false;
  }
}
