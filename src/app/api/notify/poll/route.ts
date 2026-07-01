import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sendAgentNotification } from "@/lib/notifications/telegram";
import type { Listing, NotificationFilter } from "@/lib/supabase/types";

/**
 * Check whether a listing matches a notification filter's criteria.
 * Empty arrays / null values mean "any" for that dimension.
 * All set dimensions must match (AND).
 */
function listingMatchesFilter(
  listing: Listing,
  filter: NotificationFilter,
): boolean {
  if (
    filter.property_types.length > 0 &&
    !filter.property_types.includes(listing.property_type ?? "")
  ) {
    return false;
  }
  if (
    filter.transaction_types.length > 0 &&
    !filter.transaction_types.includes(listing.transaction_type ?? "")
  ) {
    return false;
  }
  if (
    filter.sources.length > 0 &&
    !filter.sources.includes(listing.source)
  ) {
    return false;
  }
  if (
    filter.advertiser_types.length > 0 &&
    !filter.advertiser_types.includes(listing.advertiser_type ?? "")
  ) {
    return false;
  }
  if (
    filter.statuses.length > 0 &&
    !filter.statuses.includes(listing.status)
  ) {
    return false;
  }

  if (
    filter.location_counties.length > 0 &&
    !filter.location_counties.includes(listing.location_county ?? "")
  ) {
    return false;
  }
  if (
    filter.location_cities.length > 0 &&
    !filter.location_cities.includes(listing.location_city ?? "")
  ) {
    return false;
  }
  if (
    filter.location_neighborhoods.length > 0 &&
    !filter.location_neighborhoods.includes(listing.location_neighborhood ?? "")
  ) {
    return false;
  }

  if (
    filter.price_min !== null &&
    (listing.price_numeric === null || listing.price_numeric < filter.price_min)
  ) {
    return false;
  }
  if (
    filter.price_max !== null &&
    (listing.price_numeric === null || listing.price_numeric > filter.price_max)
  ) {
    return false;
  }

  if (
    filter.size_min !== null &&
    (listing.size_m2 === null || listing.size_m2 < filter.size_min)
  ) {
    return false;
  }
  if (
    filter.size_max !== null &&
    (listing.size_m2 === null || listing.size_m2 > filter.size_max)
  ) {
    return false;
  }

  return true;
}

function formatMatchLine(listing: Listing): string {
  return [
    `🏠 ${listing.title}`,
    `💰 ${listing.price || "Na upit"}`,
    `📍 ${listing.location || "Nepoznato"}`,
    `🔗 ${listing.url}`,
  ].join("\n");
}

/**
 * POST /api/notify/poll
 *
 * Body (all optional):
 *   filter_id: string  -> only run for this specific filter (used by "Test" button)
 *   dry_run: boolean   -> if true, do not actually send Telegram or update DB
 *
 * Behavior:
 *   - Loads active notification_filters (or a single filter if filter_id is given)
 *   - For each filter, finds listings created after filter.last_notified_at
 *     (or the last 24h if never notified) that match the filter's criteria
 *   - Sends one batched Telegram message per filter (via sendAgentNotification)
 *   - Updates filter.last_notified_at on success
 */
export async function POST(request: Request) {
  try {
    let body: { filter_id?: string; dry_run?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine (cron GET/POST case)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;

    let filtersQuery = supabase.from("notification_filters").select("*");
    if (body.filter_id) {
      filtersQuery = filtersQuery.eq("id", body.filter_id);
    } else {
      filtersQuery = filtersQuery.eq("is_active", true);
    }

    const { data: filtersData, error: filtersError } = await filtersQuery;
    if (filtersError) {
      return NextResponse.json(
        { error: `Failed to load filters: ${filtersError.message}` },
        { status: 500 },
      );
    }

    const filters = (filtersData || []) as NotificationFilter[];

    if (filters.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active filters to process",
        processed: 0,
      });
    }

    // Determine the earliest cutoff across all filters to fetch a minimal set
    // of candidate listings. Fallback = 24h ago for filters never notified.
    const now = Date.now();
    const fallbackCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const earliestCutoff = filters.reduce<string>((min, f) => {
      const cutoff = f.last_notified_at ?? fallbackCutoff;
      return cutoff < min ? cutoff : min;
    }, new Date().toISOString());

    // Fetch candidate listings created since the earliest cutoff
    const { data: listingsData, error: listingsError } = await supabase
      .from("listings")
      .select("*")
      .gte("created_at", earliestCutoff)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(500);

    if (listingsError) {
      return NextResponse.json(
        { error: `Failed to load listings: ${listingsError.message}` },
        { status: 500 },
      );
    }

    const listings = (listingsData || []) as Listing[];

    let totalMatches = 0;
    const results: Array<{
      filter_id: string;
      filter_name: string;
      matches: number;
      sent: boolean;
      error?: string;
    }> = [];

    for (const filter of filters) {
      const perFilterCutoff = filter.last_notified_at ?? fallbackCutoff;
      const matches = listings.filter(
        (l) =>
          l.created_at > perFilterCutoff && listingMatchesFilter(l, filter),
      );

      if (matches.length === 0) {
        results.push({
          filter_id: filter.id,
          filter_name: filter.name,
          matches: 0,
          sent: false,
        });
        continue;
      }

      totalMatches += matches.length;

      if (body.dry_run) {
        results.push({
          filter_id: filter.id,
          filter_name: filter.name,
          matches: matches.length,
          sent: false,
        });
        continue;
      }

      const messages = matches.map(formatMatchLine);
      const sent = await sendAgentNotification(messages, filter.telegram_chat_id);

      if (sent) {
        await supabase
          .from("notification_filters")
          .update({ last_notified_at: new Date().toISOString() })
          .eq("id", filter.id);
        results.push({
          filter_id: filter.id,
          filter_name: filter.name,
          matches: matches.length,
          sent: true,
        });
      } else {
        results.push({
          filter_id: filter.id,
          filter_name: filter.name,
          matches: matches.length,
          sent: false,
          error: "Telegram send failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: filters.length,
      matches: totalMatches,
      dry_run: body.dry_run ?? false,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

// Also expose as GET for simple cron integrations (Vercel Cron uses GET)
export async function GET() {
  return POST(new Request("http://localhost/api/notify/poll", { method: "POST" }));
}
