import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { scrapeNjuskalo } from "@/lib/scraper/njuskalo";

export const maxDuration = 120; // Playwright scraping needs more time

export async function POST() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

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
    const listings = await scrapeNjuskalo({
      maxPages: 1,
      delayMs: 2000,
    });

    // Get existing external IDs for deduplication
    const { data: existingListings } = await supabase
      .from("listings")
      .select("external_id");

    const existingIds = new Set(
      (existingListings || []).map((l: { external_id: string }) => l.external_id)
    );

    // Filter to only new listings
    const newListings = listings.filter(
      (l) => !existingIds.has(l.external_id)
    );

    // Upsert new listings in batches (ignore duplicates via external_id)
    let insertedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < newListings.length; i += batchSize) {
      const batch = newListings.slice(i, i + batchSize);
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

    // Update scrape run with results
    await supabase
      .from("scrape_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        listings_found: listings.length,
        new_listings: insertedCount,
      })
      .eq("id", scrapeRun.id);

    return NextResponse.json({
      success: true,
      listings_found: listings.length,
      new_listings: insertedCount,
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
