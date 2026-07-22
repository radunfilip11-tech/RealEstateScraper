import { getSupabaseServerClient } from "../supabase/server";
import { sendAgentNotification } from "./telegram";
import type { Listing, NotificationFilter } from "../supabase/types";

function listingMatchesFilter(
  listing: Listing,
  filter: NotificationFilter
): boolean {
  if (
    filter.property_types.length > 0 &&
    !filter.property_types.includes(listing.property_type ?? "")
  )
    return false;
  if (
    filter.transaction_types.length > 0 &&
    !filter.transaction_types.includes(listing.transaction_type ?? "")
  )
    return false;
  if (filter.sources.length > 0 && !filter.sources.includes(listing.source))
    return false;
  if (
    filter.advertiser_types.length > 0 &&
    !filter.advertiser_types.includes(listing.advertiser_type ?? "")
  )
    return false;
  if (filter.statuses.length > 0 && !filter.statuses.includes(listing.status))
    return false;

  // Location matching: If ANY location filters are set, the listing must match AT LEAST ONE (OR logic).
  const hasLocationFilters =
    filter.location_counties.length > 0 ||
    filter.location_cities.length > 0 ||
    filter.location_neighborhoods.length > 0;

  if (hasLocationFilters) {
    const matchesCounty = filter.location_counties.includes(
      listing.location_county ?? ""
    );
    const matchesCity = filter.location_cities.includes(
      listing.location_city ?? ""
    );
    const matchesNeighborhood = filter.location_neighborhoods.includes(
      listing.location_neighborhood ?? ""
    );

    if (!matchesCounty && !matchesCity && !matchesNeighborhood) {
      return false;
    }
  }

  if (
    filter.price_min !== null &&
    (listing.price_numeric === null || listing.price_numeric < filter.price_min)
  )
    return false;
  if (
    filter.price_max !== null &&
    (listing.price_numeric === null || listing.price_numeric > filter.price_max)
  )
    return false;
  if (
    filter.size_min !== null &&
    (listing.size_m2 === null || listing.size_m2 < filter.size_min)
  )
    return false;
  if (
    filter.size_max !== null &&
    (listing.size_m2 === null || listing.size_m2 > filter.size_max)
  )
    return false;

  return true;
}

function formatMatchLine(listing: Listing, index: number): string {
  return [
    `*#${index + 1}*  🏠 ${listing.title}`,
    `💰 ${listing.price || "Na upit"}`,
    `📍 ${listing.location || "Nepoznato"}`,
    `🔗 ${listing.url}`,
  ].join("\n");
}

/**
 * Executes a single notification poll cycle.
 * Checks active notification filters against recently created listings,
 * sends Telegram notifications for matches, and updates filter timestamp.
 */
export async function runNotificationPoll(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] Running notification poll cycle...`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  const { data: filtersData, error: filtersError } = await supabase
    .from("notification_filters")
    .select("*")
    .eq("is_active", true);

  if (filtersError) {
    console.error("[notify-poll] Failed to load filters:", filtersError.message);
    return;
  }

  const filters = (filtersData || []) as NotificationFilter[];
  if (filters.length === 0) {
    console.log("[notify-poll] No active filters.");
    return;
  }

  const now = Date.now();
  const fallbackCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const earliestCutoff = filters.reduce<string>((min, f) => {
    const cutoff = f.last_notified_at ?? fallbackCutoff;
    return cutoff < min ? cutoff : min;
  }, new Date().toISOString());

  const { data: listingsData, error: listingsError } = await supabase
    .from("listings")
    .select("*")
    .gte("created_at", earliestCutoff)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(500);

  if (listingsError) {
    console.error("[notify-poll] Failed to load listings:", listingsError.message);
    return;
  }

  const listings = (listingsData || []) as Listing[];

  for (const filter of filters) {
    const perFilterCutoff = filter.last_notified_at ?? fallbackCutoff;
    const matches = listings.filter(
      (l) => l.created_at > perFilterCutoff && listingMatchesFilter(l, filter)
    );

    if (matches.length === 0) {
      console.log(`[notify-poll] "${filter.name}": no new matches`);
      continue;
    }

    console.log(
      `[notify-poll] "${filter.name}": ${matches.length} matches, sending...`
    );

    const messages = matches.map(formatMatchLine);
    const sent = await sendAgentNotification(messages, filter.telegram_chat_id);

    if (sent) {
      await supabase
        .from("notification_filters")
        .update({ last_notified_at: new Date().toISOString() })
        .eq("id", filter.id);
      console.log(`[notify-poll] "${filter.name}": Telegram sent OK`);
    } else {
      console.error(`[notify-poll] "${filter.name}": Telegram send FAILED`);
    }
  }
}
