import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const LATENCY_OUTLIER_CAP_MS = 5 * 60 * 1000;
const RECENT_LATENCY_COUNT = 15;
const RECENT_CATEGORY_GAPS = 5;
const RECENT_WORKER_CYCLES = 10;

function computeGaps(
  timestamps: number[],
  maxGapMs: number
): { avgGapMs: number; lastGapMs: number | null; recentGapsMs: number[] } {
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > 0 && gap < maxGapMs) gaps.push(gap);
  }
  const recentGapsMs = gaps.slice(-RECENT_CATEGORY_GAPS);
  return {
    avgGapMs: gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0,
    lastGapMs: gaps.length > 0 ? gaps[gaps.length - 1] : null,
    recentGapsMs,
  };
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = Date.now();

    // -----------------------------------------------------------------------
    // 1. Detection Latency Stats
    // -----------------------------------------------------------------------
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentListings, error: listingsError } = await supabase
      .from("listings")
      .select("id, title, created_at, published_at, is_promoted")
      .gte("created_at", twentyFourHoursAgo)
      .not("published_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    let avgLatencyMs = 0;
    let minLatencyMs = 0;
    let maxLatencyMs = 0;
    let totalAds24h = 0;
    const recentLatencies: {
      id: string;
      title: string;
      latencyMs: number;
      createdAt: string;
    }[] = [];

    if (!listingsError && recentListings && recentListings.length > 0) {
      totalAds24h = recentListings.length;

      const latencies = recentListings
        .filter((l: any) => !l.is_promoted)
        .map((l: any) => {
          const created = new Date(l.created_at).getTime();
          const published = new Date(l.published_at).getTime();
          return { listing: l, ms: created - published };
        })
        .filter(({ ms }) => ms > 0 && ms < LATENCY_OUTLIER_CAP_MS);

      if (latencies.length > 0) {
        const msValues = latencies.map(({ ms }) => ms);
        avgLatencyMs = Math.round(msValues.reduce((a, b) => a + b, 0) / msValues.length);
        minLatencyMs = Math.min(...msValues);
        maxLatencyMs = Math.max(...msValues);
      }

      for (const { listing, ms } of latencies.slice(0, RECENT_LATENCY_COUNT)) {
        recentLatencies.push({
          id: listing.id,
          title: listing.title,
          latencyMs: ms,
          createdAt: listing.created_at,
        });
      }
    }

    // Total ads count (may exceed the 100 fetched for latency detail)
    const { count: adsCount24h } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", twentyFourHoursAgo);
    if (adsCount24h != null) totalAds24h = adsCount24h;

    // Traffic by hour distribution (last 3000 private ads)
    const adsPerHour = new Array(24).fill(0);
    const { data: adsForStats } = await supabase
      .from("listings")
      .select("published_at, created_at")
      .order("created_at", { ascending: false })
      .limit(3000);
      
    if (adsForStats) {
      for (const ad of adsForStats) {
        const timeStr = ad.published_at || ad.created_at;
        if (timeStr) {
          const hour = new Date(timeStr).getHours();
          adsPerHour[hour]++;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 2. Cycle Frequency Stats
    // -----------------------------------------------------------------------
    const { data: recentRunsRaw, error: runsError } = await supabase
      .from("scrape_runs")
      .select("started_at, worker_id, cycle_duration_s, new_listings, status")
      .gte("started_at", twentyFourHoursAgo)
      .order("started_at", { ascending: false })
      .limit(1000);

    const recentRuns = recentRunsRaw ? recentRunsRaw.reverse() : [];

    let avgCycleDurationS = 0;
    let totalCycles24h = 0;
    let avgTimeBetweenScansMs = 0;

    if (!runsError && recentRuns && recentRuns.length > 0) {
      totalCycles24h = recentRuns.length;

      const durations = recentRuns
        .map((r: any) => r.cycle_duration_s)
        .filter((d: any) => d != null && d > 0);
      if (durations.length > 0) {
        avgCycleDurationS = Math.round(
          durations.reduce((a: number, b: number) => a + b, 0) / durations.length
        );
      }

      if (recentRuns.length >= 2) {
        const timestamps = recentRuns.map((r: any) => new Date(r.started_at).getTime());
        let totalGaps = 0;
        let gapCount = 0;
        for (let i = 1; i < timestamps.length; i++) {
          const gap = timestamps[i] - timestamps[i - 1];
          if (gap > 0 && gap < 60 * 60 * 1000) {
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
    // -----------------------------------------------------------------------
    const { data: categoryScansRaw, error: catError } = await supabase
      .from("category_scans")
      .select("category, scanned_at, worker_id")
      .gte("scanned_at", twentyFourHoursAgo)
      .order("scanned_at", { ascending: false })
      .limit(2000);

    const categoryScans = categoryScansRaw ? categoryScansRaw.reverse() : [];

    const categoryGapsMs: Record<string, number> = {};
    const categoryDetails: Record<
      string,
      {
        avgGapMs: number;
        lastGapMs: number | null;
        lastScannedAt: string | null;
        recentGapsMs: number[];
      }
    > = {};
    let avgCategoryScanGapMs = 0;

    if (!catError && categoryScans && categoryScans.length > 0) {
      const catTimestamps: Record<string, number[]> = {};
      const catLastScan: Record<string, string> = {};

      for (const row of categoryScans) {
        if (!catTimestamps[row.category]) catTimestamps[row.category] = [];
        catTimestamps[row.category].push(new Date(row.scanned_at).getTime());
        catLastScan[row.category] = row.scanned_at;
      }

      let grandTotalGaps = 0;
      let grandGapCount = 0;

      for (const cat in catTimestamps) {
        const ts = catTimestamps[cat];
        const { avgGapMs, lastGapMs, recentGapsMs } = computeGaps(ts, 20 * 60 * 1000);

        if (avgGapMs > 0) categoryGapsMs[cat] = avgGapMs;
        categoryDetails[cat] = {
          avgGapMs,
          lastGapMs,
          lastScannedAt: catLastScan[cat] || null,
          recentGapsMs,
        };

        for (let i = 1; i < ts.length; i++) {
          const gap = ts[i] - ts[i - 1];
          if (gap > 0 && gap < 20 * 60 * 1000) {
            grandTotalGaps += gap;
            grandGapCount++;
          }
        }
      }

      if (grandGapCount > 0) {
        avgCategoryScanGapMs = Math.round(grandTotalGaps / grandGapCount);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Per-worker stats
    // -----------------------------------------------------------------------
    const workers: Record<
      number,
      {
        lastCycleDurationS: number | null;
        lastCycleStartedAt: string | null;
        lastCycleEndedAt: string | null;
        secondsSinceCycleEnd: number | null;
        secondsSinceCategoryScan: number | null;
        lastCategory: string | null;
        lastCategoryScanAt: string | null;
        avgCycleDurationS: number;
        recentCycles: { durationS: number; startedAt: string; newListings: number }[];
        recentCategoryGapsMs: number[];
        status: "scanning" | "resting" | "idle";
      }
    > = {};

    const workerIds = [1, 2];
    for (const workerId of workerIds) {
      const workerRuns = (recentRuns || [])
        .filter((r: any) => Number(r.worker_id) === workerId && r.status === "success")
        .sort((a: any, b: any) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

      const lastRun = workerRuns[0] as any | undefined;
      let lastCycleEndedAt: string | null = null;
      let secondsSinceCycleEnd: number | null = null;

      if (lastRun?.started_at && lastRun.cycle_duration_s) {
        const endMs =
          new Date(lastRun.started_at).getTime() + lastRun.cycle_duration_s * 1000;
        lastCycleEndedAt = new Date(endMs).toISOString();
        secondsSinceCycleEnd = Math.round((now - endMs) / 1000);
      }

      const workerCatScans = (categoryScans || [])
        .filter((s: any) => Number(s.worker_id) === workerId)
        .sort((a: any, b: any) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());

      const lastCatScan = workerCatScans[0] as any | undefined;
      const lastCategoryScanAt = lastCatScan?.scanned_at || null;
      const lastCategory = lastCatScan?.category || null;
      const secondsSinceCategoryScan = lastCategoryScanAt
        ? Math.round((now - new Date(lastCategoryScanAt).getTime()) / 1000)
        : null;

      const catTimestampsAsc = workerCatScans
        .map((s: any) => new Date(s.scanned_at).getTime())
        .sort((a, b) => a - b);
      const { recentGapsMs: recentCategoryGapsMs } = computeGaps(
        catTimestampsAsc,
        20 * 60 * 1000
      );

      const recentCycles = workerRuns.slice(0, RECENT_WORKER_CYCLES).map((r: any) => ({
        durationS: r.cycle_duration_s || 0,
        startedAt: r.started_at,
        newListings: r.new_listings || 0,
      }));

      const successDurations = workerRuns
        .slice(0, RECENT_WORKER_CYCLES)
        .map((r: any) => r.cycle_duration_s)
        .filter((d: number) => d != null && d > 0);
      const avgCycleDurationSWorker =
        successDurations.length > 0
          ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
          : 0;

      // Infer current state from timestamps
      let status: "scanning" | "resting" | "idle" = "idle";
      if (lastRun?.started_at) {
        const cycleStartMs = new Date(lastRun.started_at).getTime();
        const cycleEndMs = cycleStartMs + (lastRun.cycle_duration_s || 0) * 1000;
        const lastScanMs = lastCategoryScanAt ? new Date(lastCategoryScanAt).getTime() : 0;

        if (lastScanMs > cycleStartMs && now < cycleEndMs + 120000) {
          // Category scan happened after cycle start — likely mid-cycle or just finished
          if (secondsSinceCategoryScan != null && secondsSinceCategoryScan < 20) {
            status = "scanning";
          } else if (secondsSinceCycleEnd != null && secondsSinceCycleEnd >= 0 && secondsSinceCycleEnd < 120) {
            status = "resting";
          }
        } else if (secondsSinceCycleEnd != null && secondsSinceCycleEnd < 90) {
          status = "resting";
        }
      }

      workers[workerId] = {
        lastCycleDurationS: lastRun?.cycle_duration_s ?? null,
        lastCycleStartedAt: lastRun?.started_at ?? null,
        lastCycleEndedAt,
        secondsSinceCycleEnd,
        secondsSinceCategoryScan,
        lastCategory,
        lastCategoryScanAt,
        avgCycleDurationS: avgCycleDurationSWorker,
        recentCycles,
        recentCategoryGapsMs,
        status,
      };
    }

    return NextResponse.json({
      latency: {
        avgMs: avgLatencyMs,
        minMs: minLatencyMs,
        maxMs: maxLatencyMs,
        recent: recentLatencies,
      },
      ads: {
        total24h: totalAds24h,
        adsPerHour: adsPerHour,
      },
      cycles: {
        total24h: totalCycles24h,
        avgDurationS: avgCycleDurationS,
        avgTimeBetweenScansMs,
        avgCategoryScanGapMs,
        categoryGapsMs,
        categoryDetails,
      },
      workers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
