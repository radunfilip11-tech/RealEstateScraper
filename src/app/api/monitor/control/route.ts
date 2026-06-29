import { NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const PID_FILE = path.resolve(process.cwd(), "monitor.pid");

export async function POST(req: Request) {
  try {
    const { action } = await req.json();

    if (action === "start") {
      if (fs.existsSync(PID_FILE)) {
        return NextResponse.json({ error: "Monitor is already running." }, { status: 400 });
      }

      // Spawn the monitor process detached
      const child = spawn("npm", ["run", "monitor"], {
        detached: true,
        stdio: "ignore",
        cwd: process.cwd(),
        shell: process.platform === "win32"
      });

      child.unref(); // Allow the parent (Next.js) to exit independently

      // The monitor script will write its own PID file when it starts,
      // but we can also write it here as a fallback/immediate indicator.
      if (child.pid) {
         fs.writeFileSync(PID_FILE, child.pid.toString(), "utf-8");
      }

      return NextResponse.json({ success: true, message: "Monitor started." });
    }

    if (action === "stop") {
      if (!fs.existsSync(PID_FILE)) {
        return NextResponse.json({ error: "Monitor is not running." }, { status: 400 });
      }

      // We just delete the PID file. The monitor loop checks for this file and will
      // gracefully shut down on the next cycle iteration if it's missing.
      fs.unlinkSync(PID_FILE);
      
      // Optionally, we could read the PID and process.kill(pid), but graceful shutdown
      // via the missing PID file is cleaner for Playwright.
      return NextResponse.json({ success: true, message: "Monitor stop requested (graceful shutdown)." });
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

      return NextResponse.json({ success: true, message: "Database cleared." });
    }

    if (action === "status") {
      const isRunning = fs.existsSync(PID_FILE);
      return NextResponse.json({ isRunning });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
