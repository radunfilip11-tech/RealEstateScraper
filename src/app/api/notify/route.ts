import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sendAgentNotification } from "@/lib/notifications/telegram";
import type { Listing, Buyer } from "@/lib/supabase/types";

function matchesCriteria(listing: Listing, criteria: Record<string, any> | null): boolean {
  if (!criteria) return false;
  if (Object.keys(criteria).length === 0) return false;

  if (criteria.property_type && listing.property_type !== criteria.property_type) return false;
  if (criteria.location_county && listing.location_county !== criteria.location_county) return false;
  
  if (criteria.price_min && (listing.price_numeric === null || listing.price_numeric < criteria.price_min)) return false;
  if (criteria.price_max && (listing.price_numeric === null || listing.price_numeric > criteria.price_max)) return false;
  
  if (criteria.size_m2_min && (listing.size_m2 === null || listing.size_m2 < criteria.size_m2_min)) return false;
  if (criteria.size_m2_max && (listing.size_m2 === null || listing.size_m2 > criteria.size_m2_max)) return false;

  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const chatId = body.chat_id || body.phone_number;

    if (!chatId) {
      return NextResponse.json(
        { error: "chat_id is required" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;

    // Fetch buyers
    const { data: buyersData, error: buyersError } = await supabase.from("buyers").select("*");
    const buyers = (buyersData || []) as Buyer[];

    if (buyersError) {
      console.error("Failed to fetch buyers:", buyersError);
    }

    // Get un-notified listings
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("notified", false)
      .order("created_at", { ascending: false })
      .limit(50);

    const listings = (data || []) as Listing[];

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch listings" },
        { status: 500 }
      );
    }

    if (listings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new listings to notify about",
        count: 0,
      });
    }

    const matchedMessages: string[] = [];

    for (const listing of listings) {
      const matchedBuyers = buyers.filter((b) => matchesCriteria(listing, b.criteria));
      if (matchedBuyers.length > 0) {
        const buyerNames = matchedBuyers.map((b) => b.name).join(", ");
        matchedMessages.push(`👤 *Za kupce:* ${buyerNames}\n🏠 ${listing.title}\n💰 ${listing.price || "Na upit"}\n📍 ${listing.location || "Nepoznato"}\n🔗 ${listing.url}`);
      }
    }

    // Send notification to the agent if there are matches
    if (matchedMessages.length > 0) {
      const sent = await sendAgentNotification(matchedMessages, chatId);
      if (!sent) {
        return NextResponse.json(
          { error: "Failed to send Telegram notification" },
          { status: 500 },
        );
      }
    }

    // Always mark as notified so we don't process them again
    const ids = listings.map((l) => l.id);
    await supabase.from("listings").update({ notified: true }).in("id", ids);

    return NextResponse.json({
      success: true,
      message: `Processed ${listings.length} listings. Sent ${matchedMessages.length} matches to agent.`,
      count: listings.length,
      matches: matchedMessages.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
