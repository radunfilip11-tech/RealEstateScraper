import { scrapeNjuskalo } from "../src/lib/scraper/njuskalo";
import { getSupabaseServerClient } from "../src/lib/supabase/server";
import { sendAgentNotification } from "../src/lib/notifications/whatsapp";
import type { Listing, Buyer } from "../src/lib/supabase/types";

// Helper to check if listing matches buyer criteria
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

async function runCron() {
  console.log("Starting CLI Cron Job...");
  const supabase = getSupabaseServerClient() as any;

  // 1. Log the run
  const { data: scrapeRun } = await supabase
    .from("scrape_runs")
    .insert({
      source: "njuskalo",
      status: "running",
    })
    .select()
    .single();

  if (!scrapeRun) {
    console.error("Failed to create scrape run in DB.");
    process.exit(1);
  }

  try {
    // 2. Scrape (we can limit maxPages here for cron runs to avoid timeouts)
    console.log("Scraping Njuškalo (Cron Mode - 2 pages per category)...");
    const listings = await scrapeNjuskalo({
      maxPages: 2,
      delayMs: 2000,
    });

    console.log(`Scraped ${listings.length} listings. Deduplicating...`);

    // 3. Deduplicate
    const { data: existingListings } = await supabase.from("listings").select("external_id, created_at");
    const existingMap = new Map<string, number>(
      (existingListings || []).map((l: any) => [l.external_id, new Date(l.created_at).getTime()])
    );

    const trueNewListings = [];
    const renewedListings = [];
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const now = Date.now();

    for (const listing of listings) {
      if (existingMap.has(listing.external_id)) {
        const createdAtTime = existingMap.get(listing.external_id)!;
        if (now - createdAtTime > twelveHoursMs) {
          renewedListings.push(listing);
        }
      } else {
        trueNewListings.push(listing);
      }
    }

    // 4. Save to DB
    let insertedCount = 0;
    for (let i = 0; i < trueNewListings.length; i += 50) {
      const batch = trueNewListings.slice(i, i + 50);
      const { error } = await supabase.from("listings").insert(batch);
      if (!error) insertedCount += batch.length;
      else console.error("Batch insert error:", error);
    }

    let renewedCount = 0;
    for (const listing of renewedListings) {
      const { error } = await supabase
        .from("listings")
        .update({
          status: "Obnovljen",
          created_at: new Date().toISOString(),
          notified: false,
        })
        .eq("external_id", listing.external_id);
      if (!error) renewedCount++;
      else console.error("Renewal update error:", error);
    }

    await supabase.from("scrape_runs").update({
      status: "success",
      completed_at: new Date().toISOString(),
      listings_found: listings.length,
      new_listings: insertedCount,
    }).eq("id", scrapeRun.id);

    console.log(`Saved ${insertedCount} new, ${renewedCount} renewed.`);

    // 5. Notifications
    const targetPhone = process.env.AGENT_PHONE_NUMBER;
    if (!targetPhone) {
      console.log("No AGENT_PHONE_NUMBER set for notifications. Skipping WhatsApp.");
      return;
    }

    console.log("Checking for unnotified listings matching buyers...");
    const { data: buyersData } = await supabase.from("buyers").select("*");
    const buyers = (buyersData || []) as Buyer[];

    const { data: unnotifiedListings } = await supabase
      .from("listings")
      .select("*")
      .eq("notified", false)
      .order("created_at", { ascending: false })
      .limit(20);

    let notificationsSent = 0;
    if (unnotifiedListings && unnotifiedListings.length > 0) {
      for (const listing of unnotifiedListings) {
        let isMatch = false;
        for (const buyer of buyers) {
          if (matchesCriteria(listing as Listing, buyer.criteria as Record<string, any>)) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          try {
            await sendAgentNotification(targetPhone, listing as Listing);
            await supabase.from("listings").update({ notified: true }).eq("id", listing.id);
            notificationsSent++;
          } catch (e) {
            console.error("WhatsApp error:", e);
          }
        }
      }
    }
    
    console.log(`Sent ${notificationsSent} WhatsApp notifications.`);
    console.log("Cron finished successfully!");

  } catch (err) {
    console.error("Cron Error:", err);
    await supabase.from("scrape_runs").update({ status: "error" }).eq("id", scrapeRun.id);
    process.exit(1);
  }
}

runCron();
