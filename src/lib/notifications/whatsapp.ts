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
 * Send a summary notification for multiple new listings
 */
export async function sendBatchNotification(
  listings: Listing[],
  toPhoneNumber: string
): Promise<boolean> {
  if (listings.length === 0) return true;

  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

    const message = [
      `🏠 *${listings.length} novih oglasa!*`,
      "",
      ...listings.slice(0, 5).map(
        (l, i) =>
          `${i + 1}. ${l.title}${l.price ? ` — ${l.price}` : ""}${l.location ? ` (${l.location})` : ""}`
      ),
      listings.length > 5 ? `\n...i još ${listings.length - 5} oglasa.` : "",
      "",
      "Otvorite dashboard za pregled svih oglasa.",
    ].join("\n");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).messages.create({
      body: message,
      from: fromNumber,
      to: `whatsapp:${toPhoneNumber}`,
    });

    console.log(
      `[WhatsApp] Batch notification sent (${listings.length} listings) to ${toPhoneNumber}`
    );
    return true;
  } catch (error) {
    console.error("[WhatsApp] Failed to send batch notification:", error);
    return false;
  }
}
