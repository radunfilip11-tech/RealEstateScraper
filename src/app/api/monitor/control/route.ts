import { NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_WORKER_COUNT = 3;

function getPidFilePath(workerId: number): string {
  return path.resolve(process.cwd(), `monitor-${workerId}.pid`);
}

function getActiveWorkerIds(): number[] {
  const active: number[] = [];
  // Check for worker IDs 1 through 10 (more than enough)
  for (let i = 1; i <= 10; i++) {
    if (fs.existsSync(getPidFilePath(i))) {
      active.push(i);
    }
  }
  return active;
}

export async function POST(req: Request) {
  try {
    const { action, workers } = await req.json();

    if (action === "start") {
      const activeWorkers = getActiveWorkerIds();
      if (activeWorkers.length > 0) {
        return NextResponse.json(
          { error: `Monitor already running with ${activeWorkers.length} worker(s).` },
          { status: 400 }
        );
      }

      const workerCount = workers || DEFAULT_WORKER_COUNT;

      // Spawn N separate worker processes
      for (let i = 1; i <= workerCount; i++) {
        const child = spawn(
          "npm",
          ["run", "monitor", "--", "--worker-id", String(i)],
          {
            detached: true,
            stdio: "ignore",
            cwd: process.cwd(),
            shell: process.platform === "win32",
          }
        );

        child.unref(); // Allow the parent (Next.js) to exit independently

        // Write PID file as a fallback/immediate indicator
        if (child.pid) {
          fs.writeFileSync(getPidFilePath(i), child.pid.toString(), "utf-8");
        }
      }

      return NextResponse.json({
        success: true,
        message: `Monitor started with ${workerCount} workers.`,
        workerCount,
      });
    }

    if (action === "stop") {
      const activeWorkers = getActiveWorkerIds();
      if (activeWorkers.length === 0) {
        return NextResponse.json(
          { error: "Monitor is not running." },
          { status: 400 }
        );
      }

      // Delete all PID files to signal graceful shutdown
      for (const workerId of activeWorkers) {
        const pidFile = getPidFilePath(workerId);
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Stop requested for ${activeWorkers.length} worker(s) (graceful shutdown).`,
      });
    }

    if (action === "clear_db") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
      }
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Clear both tables
      await supabase.from("listings").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all
      await supabase.from("scraper_console_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("scrape_runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("category_scans").delete().neq("id", 0);

      return NextResponse.json({ success: true, message: "Database cleared." });
    }

    if (action === "status") {
      const activeWorkers = getActiveWorkerIds();
      return NextResponse.json({
        isRunning: activeWorkers.length > 0,
        workerCount: activeWorkers.length,
        workerIds: activeWorkers,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
