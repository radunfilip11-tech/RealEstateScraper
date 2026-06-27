import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sendBatchNotification } from "@/lib/notifications/whatsapp";
import type { Listing } from "@/lib/supabase/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phoneNumber = body.phone_number;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "phone_number is required" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;

    // Get un-notified listings
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("notified", false)
      .order("created_at", { ascending: false })
      .limit(20);

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

    // Send notification
    const sent = await sendBatchNotification(listings, phoneNumber);

    if (sent) {
      // Mark as notified
      const ids = listings.map((l) => l.id);
      await supabase.from("listings").update({ notified: true }).in("id", ids);

      return NextResponse.json({
        success: true,
        message: `Notification sent for ${listings.length} listings`,
        count: listings.length,
      });
    } else {
      return NextResponse.json(
        { error: "Failed to send WhatsApp notification" },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
