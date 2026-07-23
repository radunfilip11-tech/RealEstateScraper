import { getSupabaseServerClient } from "../supabase/server";
import { sendAgentNotification } from "./telegram";
import type { Listing, NotificationFilter } from "../supabase/types";

/** Hard cap per filter per poll cycle — keeps Telegram batches sane and query fast. */
const MAX_MATCHES_PER_FILTER = 300;

export interface PollResult {
  filter_id: string;
  filter_name: string;
  matches: number;
  sent: boolean;
  error?: string;
}

interface PollOptions {
  /** Only poll this single filter (used by the "Test" button), ignoring is_active. */
  filterId?: string;
  /** Compute matches but do not send Telegram or advance last_notified_at. */
  dryRun?: boolean;
}

/** Quote a value for safe use inside a PostgREST `.or()` filter string. */
function quoteOrValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Push a filter's criteria into the Supabase query builder so matching is
 * done server-side per filter, instead of loading a shared top-N slice of
 * `listings` and filtering in memory (which silently misses matches once
 * insert volume across OTHER categories/cities exceeds the slice size —
 * e.g. during a full-database backfill).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilterCriteria(query: any, filter: NotificationFilter) {
  // Defensive defaults — prod DB may not have newer columns yet, returning undefined
  const propertyTypes = filter.property_types ?? [];
  const transactionTypes = filter.transaction_types ?? [];
  const sources = filter.sources ?? [];
  const advertiserTypes = filter.advertiser_types ?? [];
  const statuses = filter.statuses ?? [];
  const locationCounties = filter.location_counties ?? [];
  const locationCities = filter.location_cities ?? [];
  const locationNeighborhoods = filter.location_neighborhoods ?? [];
  const landTypes = filter.land_types ?? [];
  const houseTypes = filter.house_types ?? [];
  const commercialTypes = filter.commercial_types ?? [];

  if (propertyTypes.length > 0) {
    query = query.in("property_type", propertyTypes);
  }
  if (transactionTypes.length > 0) {
    query = query.in("transaction_type", transactionTypes);
  }
  if (sources.length > 0) {
    query = query.in("source", sources);
  }
  if (advertiserTypes.length > 0) {
    query = query.in("advertiser_type", advertiserTypes);
  }
  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }

  if (filter.price_min !== null && filter.price_min !== undefined) query = query.gte("price_numeric", filter.price_min);
  if (filter.price_max !== null && filter.price_max !== undefined) query = query.lte("price_numeric", filter.price_max);
  if (filter.size_min !== null && filter.size_min !== undefined) query = query.gte("size_m2", filter.size_min);
  if (filter.size_max !== null && filter.size_max !== undefined) query = query.lte("size_m2", filter.size_max);
  if (filter.room_count_min != null) query = query.gte("room_count", filter.room_count_min);
  if (filter.room_count_max != null) query = query.lte("room_count", filter.room_count_max);
  if (landTypes.length > 0) query = query.in("land_type", landTypes);
  if (houseTypes.length > 0) query = query.in("house_type", houseTypes);
  if (commercialTypes.length > 0) query = query.in("commercial_type", commercialTypes);
  if (filter.yard_size_min != null) query = query.gte("yard_size_m2", filter.yard_size_min);
  if (filter.yard_size_max != null) query = query.lte("yard_size_m2", filter.yard_size_max);

  // Location matching: If ANY location filters are set, the listing must
  // match AT LEAST ONE of county/city/neighborhood (OR logic across them).
  const hasLocationFilters =
    locationCounties.length > 0 ||
    locationCities.length > 0 ||
    locationNeighborhoods.length > 0;

  if (hasLocationFilters) {
    const orParts: string[] = [];
    if (locationCounties.length > 0) {
      orParts.push(
        `location_county.in.(${locationCounties.map(quoteOrValue).join(",")})`
      );
    }
    if (locationCities.length > 0) {
      orParts.push(
        `location_city.in.(${locationCities.map(quoteOrValue).join(",")})`
      );
    }
    if (locationNeighborhoods.length > 0) {
      orParts.push(
        `location_neighborhood.in.(${locationNeighborhoods.map(quoteOrValue).join(",")})`
      );
    }
    query = query.or(orParts.join(","));
  }

  return query;
}

function formatMatchLine(listing: Listing, index: number): string {
  const details: string[] = [];
  if (listing.room_count != null) details.push(`🛏 ${listing.room_count} sob.`);
  if (listing.floor_label) details.push(`🏢 ${listing.floor_label}`);
  if (listing.size_m2) details.push(`📐 ${listing.size_m2} m²`);
  if (listing.yard_size_m2) details.push(`🌿 ${listing.yard_size_m2} m² ok.`);
  if (listing.land_type) details.push(listing.land_type);
  if (listing.house_type) details.push(listing.house_type);
  if (listing.commercial_type) details.push(listing.commercial_type);

  return [
    `*#${index + 1}*  🏠 ${listing.title}`,
    `💰 ${listing.price || "Na upit"}${details.length > 0 ? " · " + details.join(" · ") : ""}`,
    `📍 ${listing.location || "Nepoznato"}`,
    `🔗 ${listing.url}`,
  ].join("\n");
}

/**
 * Runs the notification poll — one Supabase query per active filter, each
 * scoped to that filter's own criteria and its own `last_notified_at`
 * cutoff. Returns per-filter results (used by the API route for the UI
 * "Test" button); `runNotificationPoll()` below is the void wrapper the
 * monitor workers call at the end of each cycle.
 */
export async function pollNotifications(options: PollOptions = {}): Promise<PollResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  let filtersQuery = supabase.from("notification_filters").select("*");
  filtersQuery = options.filterId
    ? filtersQuery.eq("id", options.filterId)
    : filtersQuery.eq("is_active", true);

  const { data: filtersData, error: filtersError } = await filtersQuery;
  if (filtersError) {
    console.error("[notify-poll] Failed to load filters:", filtersError.message);
    return [];
  }

  const filters = (filtersData || []) as NotificationFilter[];
  if (filters.length === 0) {
    console.log("[notify-poll] No active filters.");
    return [];
  }

  const fallbackCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const results: PollResult[] = [];

  for (const filter of filters) {
    const cutoff = filter.last_notified_at ?? fallbackCutoff;

    let query = supabase
      .from("listings")
      .select("*")
      .gt("created_at", cutoff)
      .eq("hidden", false)
      .order("created_at", { ascending: true })
      .limit(MAX_MATCHES_PER_FILTER);

    query = applyFilterCriteria(query, filter);

    const { data, error } = await query;

    if (error) {
      console.error(`[notify-poll] "${filter.name}": query failed: ${error.message}`);
      results.push({
        filter_id: filter.id,
        filter_name: filter.name,
        matches: 0,
        sent: false,
        error: error.message,
      });
      continue;
    }

    const matches = (data || []) as Listing[];

    if (matches.length === 0) {
      console.log(`[notify-poll] "${filter.name}": no new matches`);
      results.push({ filter_id: filter.id, filter_name: filter.name, matches: 0, sent: false });
      continue;
    }

    if (options.dryRun) {
      results.push({
        filter_id: filter.id,
        filter_name: filter.name,
        matches: matches.length,
        sent: false,
      });
      continue;
    }

    console.log(`[notify-poll] "${filter.name}": ${matches.length} matches, sending...`);

    const messages = matches.map(formatMatchLine);
    const sent = await sendAgentNotification(messages, filter.telegram_chat_id);

    if (sent) {
      // Advance to the newest MATCHED listing's created_at (not wall-clock
      // "now"). If matches.length hit MAX_MATCHES_PER_FILTER, this leaves
      // the cutoff right after the last sent one, so the remainder is
      // picked up on the next cycle instead of being silently skipped.
      const newestMatchedAt = matches[matches.length - 1].created_at;
      await supabase
        .from("notification_filters")
        .update({ last_notified_at: newestMatchedAt })
        .eq("id", filter.id);
      console.log(`[notify-poll] "${filter.name}": Telegram sent OK (${matches.length} matches)`);
      results.push({
        filter_id: filter.id,
        filter_name: filter.name,
        matches: matches.length,
        sent: true,
      });
    } else {
      console.error(`[notify-poll] "${filter.name}": Telegram send FAILED`);
      results.push({
        filter_id: filter.id,
        filter_name: filter.name,
        matches: matches.length,
        sent: false,
        error: "Telegram send failed",
      });
    }
  }

  return results;
}

/**
 * Executes a single notification poll cycle. Called by monitor workers at
 * the end of every scrape cycle.
 */
export async function runNotificationPoll(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] Running notification poll cycle...`);
  await pollNotifications();
}
