/**
 * Local polling script for Telegram notification filters.
 *
 * Usage:
 *   npm run notify-poll                        # continuous loop, default 5 min interval
 *   npm run notify-poll -- --once              # run one poll cycle and exit
 *   npm run notify-poll -- --interval-min 10   # continuous loop with custom interval
 *
 * Runs the same logic as POST /api/notify/poll but directly against Supabase
 * (bypassing the HTTP layer so the local Next.js server does not need to be up).
 */

import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { runNotificationPoll } from "../src/lib/notifications/poll";

const PID_FILE = path.resolve(__dirname, "../notify-poll.pid");

function parseArgs() {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const intervalIdx = args.indexOf("--interval-min");
  const intervalMin =
    intervalIdx >= 0 && args[intervalIdx + 1]
      ? Number(args[intervalIdx + 1])
      : 5;
  return { once, intervalMin };
}

async function main() {
  const { once, intervalMin } = parseArgs();

  if (once) {
    await runNotificationPoll();
    return;
  }

  // Write PID file
  fs.writeFileSync(PID_FILE, process.pid.toString(), "utf-8");

  console.log(
    `[notify-poll] Starting continuous poller (interval: ${intervalMin} min). Ctrl+C to stop.`,
  );
  let running = true;
  const shutdown = () => {
    console.log("\n[notify-poll] Shutdown requested, exiting...");
    running = false;
    if (fs.existsSync(PID_FILE)) {
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    // Check if PID file was deleted by the UI / Control API
    if (!fs.existsSync(PID_FILE)) {
      console.log("[notify-poll] PID file missing. Control API requested shutdown.");
      shutdown();
      break;
    }

    try {
      await runNotificationPoll();
    } catch (err) {
      console.error("[notify-poll] Cycle error:", err);
    }
    if (!running) break;
    
    // Check PID file multiple times during the wait so shutdown is fast
    const waitMs = intervalMin * 60 * 1000;
    const intervalCheck = 2000;
    let elapsed = 0;
    while (elapsed < waitMs && running) {
      if (!fs.existsSync(PID_FILE)) {
        console.log("[notify-poll] PID file missing during wait. Control API requested shutdown.");
        shutdown();
        break;
      }
      await new Promise((r) => setTimeout(r, intervalCheck));
      elapsed += intervalCheck;
    }
  }
}

main().catch((err) => {
  console.error("[notify-poll] Fatal:", err);
  process.exit(1);
});
