import { NextResponse } from "next/server";
import { pollNotifications } from "@/lib/notifications/poll";

/**
 * POST /api/notify/poll
 *
 * Body (all optional):
 *   filter_id: string  -> only run for this specific filter (used by "Test" button)
 *   dry_run: boolean   -> if true, do not actually send Telegram or update DB
 *
 * Behavior:
 *   - Loads active notification_filters (or a single filter if filter_id is given)
 *   - For each filter, queries `listings` directly with that filter's own
 *     criteria (property type, location, price, etc.) AND created_at after
 *     filter.last_notified_at (or the last 24h if never notified). Matching
 *     is done server-side per filter — see `pollNotifications` in
 *     `src/lib/notifications/poll.ts` for why this must NOT be a shared
 *     "top 500 listings overall" query (gets swamped by unrelated
 *     categories during high-volume scraping/backfills).
 *   - Sends one batched Telegram message per filter (via sendAgentNotification)
 *   - Updates filter.last_notified_at to the newest matched listing's
 *     created_at on success
 */
export async function POST(request: Request) {
  try {
    let body: { filter_id?: string; dry_run?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine (cron GET/POST case)
    }

    const results = await pollNotifications({
      filterId: body.filter_id,
      dryRun: body.dry_run,
    });

    const totalMatches = results.reduce((sum, r) => sum + r.matches, 0);

    return NextResponse.json({
      success: true,
      processed: results.length,
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
