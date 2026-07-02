import { NextResponse } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const PID_FILE = path.resolve(process.cwd(), "notify-poll.pid");
const LOG_FILE = path.resolve(process.cwd(), "logs", "notify-poll.log");

function isRunning(): boolean {
  return fs.existsSync(PID_FILE);
}

export async function POST(req: Request) {
  try {
    const { action } = await req.json();

    if (action === "start") {
      if (isRunning()) {
        return NextResponse.json(
          { error: "Pozadinski servis za obavijesti je već pokrenut." },
          { status: 400 }
        );
      }

      // Ensure logs directory exists
      const logsDir = path.resolve(process.cwd(), "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const out = fs.openSync(LOG_FILE, "a");
      const err = fs.openSync(LOG_FILE, "a");

      const child = spawn(
        "npm",
        ["run", "notify-poll"],
        {
          detached: true,
          stdio: ["ignore", out, err],
          cwd: process.cwd(),
          shell: process.platform === "win32",
          windowsHide: true,
        }
      );

      child.unref();

      if (child.pid) {
        fs.writeFileSync(PID_FILE, child.pid.toString(), "utf-8");
      }

      return NextResponse.json({
        success: true,
        message: "Pozadinski servis za obavijesti je uspješno pokrenut.",
      });
    }

    if (action === "stop") {
      if (!isRunning()) {
        return NextResponse.json(
          { error: "Pozadinski servis za obavijesti nije pokrenut." },
          { status: 400 }
        );
      }

      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }

      return NextResponse.json({
        success: true,
        message: "Zaustavljanje pozadinskog servisa za obavijesti je zatraženo.",
      });
    }

    if (action === "status") {
      return NextResponse.json({
        isRunning: isRunning(),
      });
    }

    return NextResponse.json({ error: "Nevaljana akcija" }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
