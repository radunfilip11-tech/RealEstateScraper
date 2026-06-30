import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // -----------------------------------------------------------------------
    // 1. Detection Latency Stats
    //    Compare published_at (when the ad went live on Njuškalo) with
    //    created_at (when we scraped it). Only look at ads from the last 24h
    //    that have a published_at value.
    // -----------------------------------------------------------------------
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentListings, error: listingsError } = await supabase
      .from("listings")
      .select("created_at, published_at")
      .gte("created_at", twentyFourHoursAgo)
      .not("published_at", "is", null);

    let avgLatencyMs = 0;
    let minLatencyMs = 0;
    let maxLatencyMs = 0;
    let totalAds24h = 0;

    if (!listingsError && recentListings && recentListings.length > 0) {
      const latencies = recentListings
        .map((l: any) => {
          const created = new Date(l.created_at).getTime();
          const published = new Date(l.published_at).getTime();
          return created - published;
        })
        .filter((ms: number) => ms > 0 && ms < 24 * 60 * 60 * 1000); // Filter out unreasonable values

      if (latencies.length > 0) {
        avgLatencyMs = Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length);
        minLatencyMs = Math.min(...latencies);
        maxLatencyMs = Math.max(...latencies);
      }
      totalAds24h = recentListings.length;
    }

    // -----------------------------------------------------------------------
    // 2. Cycle Frequency Stats
    //    Look at the scrape_runs table for successful runs in the last 24h.
    //    Calculate how fast cycles complete and how often the full site 
    //    gets scanned across all workers.
    // -----------------------------------------------------------------------
    const { data: recentRuns, error: runsError } = await supabase
      .from("scrape_runs")
      .select("started_at, worker_id, cycle_duration_s")
      .gte("started_at", twentyFourHoursAgo)
      .eq("status", "success")
      .order("started_at", { ascending: true });

    let avgCycleDurationS = 0;
    let totalCycles24h = 0;
    let avgTimeBetweenScansMs = 0; // How often the whole site gets fully scanned (across all workers)

    if (!runsError && recentRuns && recentRuns.length > 0) {
      totalCycles24h = recentRuns.length;

      // Average cycle duration (how long one worker takes to sweep all categories)
      const durations = recentRuns
        .map((r: any) => r.cycle_duration_s)
        .filter((d: any) => d != null && d > 0);
      if (durations.length > 0) {
        avgCycleDurationS = Math.round(
          durations.reduce((a: number, b: number) => a + b, 0) / durations.length
        );
      }

      // Average time between ANY two consecutive scan completions (across all workers)
      // This tells us: "on average, how often does *some* worker finish a full sweep?"
      if (recentRuns.length >= 2) {
        const timestamps = recentRuns.map((r: any) => new Date(r.started_at).getTime());
        let totalGaps = 0;
        let gapCount = 0;
        for (let i = 1; i < timestamps.length; i++) {
          const gap = timestamps[i] - timestamps[i - 1];
          if (gap > 0 && gap < 60 * 60 * 1000) { // Ignore gaps > 1 hour (probably restarts)
            totalGaps += gap;
            gapCount++;
          }
        }
        if (gapCount > 0) {
          avgTimeBetweenScansMs = Math.round(totalGaps / gapCount);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Category Frequency Stats
    //    Calculate the average time between scans for each specific category
    // -----------------------------------------------------------------------
    const { data: categoryScans, error: catError } = await supabase
      .from("category_scans")
      .select("category, scanned_at")
      .gte("scanned_at", twentyFourHoursAgo)
      .order("scanned_at", { ascending: true });

    const categoryGapsMs: Record<string, number> = {};
    let avgCategoryScanGapMs = 0;

    if (!catError && categoryScans && categoryScans.length > 0) {
      // Group by category
      const catTimestamps: Record<string, number[]> = {};
      for (const row of categoryScans) {
        if (!catTimestamps[row.category]) catTimestamps[row.category] = [];
        catTimestamps[row.category].push(new Date(row.scanned_at).getTime());
      }

      let grandTotalGaps = 0;
      let grandGapCount = 0;

      for (const cat in catTimestamps) {
        const timestamps = catTimestamps[cat];
        let catTotalGaps = 0;
        let catGapCount = 0;

        for (let i = 1; i < timestamps.length; i++) {
          const gap = timestamps[i] - timestamps[i - 1];
          if (gap > 0 && gap < 2 * 60 * 60 * 1000) { // Ignore > 2hr gaps (restarts)
            catTotalGaps += gap;
            catGapCount++;
            grandTotalGaps += gap;
            grandGapCount++;
          }
        }

        if (catGapCount > 0) {
          categoryGapsMs[cat] = Math.round(catTotalGaps / catGapCount);
        }
      }

      if (grandGapCount > 0) {
        avgCategoryScanGapMs = Math.round(grandTotalGaps / grandGapCount);
      }
    }

    return NextResponse.json({
      latency: {
        avgMs: avgLatencyMs,
        minMs: minLatencyMs,
        maxMs: maxLatencyMs,
      },
      ads: {
        total24h: totalAds24h,
      },
      cycles: {
        total24h: totalCycles24h,
        avgDurationS: avgCycleDurationS,
        avgTimeBetweenScansMs,
        avgCategoryScanGapMs,
        categoryGapsMs,
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
