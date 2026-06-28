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
    console.error("[WhatsApp] Failed to send notification:", error);
    return false;
  }
}

/**
 * Send a notification to the agent with the matched listings
 */
export async function sendAgentNotification(
  matchedMessages: string[],
  toPhoneNumber: string
): Promise<boolean> {
  if (matchedMessages.length === 0) return true;

  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

    const message = [
      `🎯 *Nove prilike za vaše kupce!*`,
      "",
      ...matchedMessages.slice(0, 10), // Limit to 10 to avoid huge messages
      matchedMessages.length > 10 ? `\n...i još ${matchedMessages.length - 10} prilika.` : "",
    ].join("\n\n");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).messages.create({
      body: message,
      from: fromNumber,
      to: `whatsapp:${toPhoneNumber}`,
    });

    console.log(
      `[WhatsApp] Agent notification sent (${matchedMessages.length} matches) to ${toPhoneNumber}`
    );
    return true;
  } catch (error) {
    console.error("[WhatsApp] Failed to send agent notification:", error);
    return false;
  }
}
