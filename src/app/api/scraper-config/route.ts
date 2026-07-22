import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SCRAPER_CONFIG, ScraperConfig } from "@/lib/supabase/types";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("scraper_config")
      .select("key, value");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const config: Record<string, any> = { ...DEFAULT_SCRAPER_CONFIG };
    if (data) {
      for (const row of data) {
        if (row.key in config) {
          try {
            config[row.key] =
              typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          } catch {
            config[row.key] = row.value;
          }
        }
      }
    }

    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const allowedKeys: (keyof ScraperConfig)[] = [
      "w1_interval_min",
      "w2_interval_min",
      "night_start_hour",
      "night_end_hour",
      "max_pages_per_category",
      "workers_enabled",
    ];

    const updates: { key: string; value: any; updated_at: string }[] = [];

    for (const key of allowedKeys) {
      if (key in body) {
        updates.push({
          key,
          value: body[key],
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No valid configuration fields provided" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("scraper_config")
      .upsert(updates, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
