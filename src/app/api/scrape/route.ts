import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { scrapeNjuskalo } from "@/lib/scraper/njuskalo";

export const maxDuration = 300; // Multi-county scraping can take several minutes

export async function POST(request: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  let maxPages = 1;
  let countySlug: string | null = null;
  const options: { maxPages: number; countySlug: string | null; categories?: string[], delayMs: number } = {
    maxPages: 1,
    countySlug: null,
    delayMs: 2000,
  };
  
  try {
    const body = await request.json();
    if (body.pages && typeof body.pages === "number") {
      maxPages = body.pages;
    }
    if (body.county && typeof body.county === "string") {
      countySlug = body.county;
    }
    if (body.categories && Array.isArray(body.categories)) {
      options.categories = body.categories;
    }
  } catch (e) {
    // ignore
  }

  // Create a scrape run record
  const { data: scrapeRun, error: runError } = await supabase
    .from("scrape_runs")
    .insert({
      source: "njuskalo",
      status: "running",
    })
    .select()
    .single();

  if (runError || !scrapeRun) {
    console.error("Failed to create scrape run:", runError);
    return NextResponse.json(
      { error: "Failed to initialize scrape run" },
      { status: 500 }
    );
  }

  try {
    // Run the scraper
    options.maxPages = maxPages;
    options.countySlug = countySlug;
    
    const listings = await scrapeNjuskalo(options);

    // Get existing external IDs and their created_at times for deduplication & renewal tracking
    const { data: existingListings } = await supabase
      .from("listings")
      .select("external_id, created_at");

    const existingMap = new Map<string, number>(
      (existingListings || []).map((l: { external_id: string; created_at: string }) => [
        l.external_id,
        new Date(l.created_at).getTime(),
      ])
    );

    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const now = Date.now();

    const trueNewListings = [];
    const renewedListings = [];
    const existingToUpdate = [];

    for (const l of listings) {
      if (!existingMap.has(l.external_id)) {
        l.status = "Novi";
        trueNewListings.push(l);
      } else {
        const createdAt = existingMap.get(l.external_id) || now;
        if (now - createdAt > TWELVE_HOURS) {
          renewedListings.push(l.external_id);
        }
        // Always push to existingToUpdate to backfill any missing data (price, location, etc.)
        existingToUpdate.push(l);
      }
    }

    // Upsert true new listings
    let insertedCount = 0;
    let renewedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < trueNewListings.length; i += batchSize) {
      const batch = trueNewListings.slice(i, i + batchSize);
      const { error: insertError, data: insertedData } = await supabase
        .from("listings")
        .upsert(batch, { onConflict: "external_id", ignoreDuplicates: true })
        .select("id");

      if (insertError) {
        console.error("Insert error:", insertError);
      } else {
        insertedCount += (insertedData || []).length;
      }
    }

    // Update existing listings data (backfill missing price/location from SuperVau detail pages)
    // We update them individually or in small batches to avoid overwriting status/hidden flags.
    for (const l of existingToUpdate) {
      await supabase
        .from("listings")
        .update({
          price: l.price,
          price_numeric: l.price_numeric,
          location: l.location,
          location_county: l.location_county,
          location_city: l.location_city,
          location_neighborhood: l.location_neighborhood,
          size_m2: l.size_m2,
          image_url: l.image_url,
          title: l.title,
        })
        .eq("external_id", l.external_id);
    }

    // Update renewed listings (bump them)
    if (renewedListings.length > 0) {
      const { error: updateError } = await supabase
        .from("listings")
        .update({
          status: "Obnovljen",
          created_at: new Date().toISOString(),
          notified: false // So it triggers a new notification
        })
        .in("external_id", renewedListings);
        
      if (updateError) {
        console.error("Update error for renewed:", updateError);
      } else {
        renewedCount = renewedListings.length;
      }
    }

    // Update scrape run with results
    await supabase
      .from("scrape_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        listings_found: listings.length,
        new_listings: insertedCount,
        error_log: renewedCount > 0 ? `Obnovljeno: ${renewedCount}` : null,
      })
      .eq("id", scrapeRun.id);

    return NextResponse.json({
      success: true,
      listings_found: listings.length,
      new_listings: insertedCount,
      renewed_listings: renewedCount,
      scrape_run_id: scrapeRun.id,
    });
  } catch (error) {
    // Update scrape run with error
    await supabase
      .from("scrape_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: (error as Error).message,
      })
      .eq("id", scrapeRun.id);

    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET endpoint to check scraper status
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  const { data: latestRun, error } = await supabase
    .from("scrape_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ status: "no_runs" });
  }

  return NextResponse.json(latestRun);
}
