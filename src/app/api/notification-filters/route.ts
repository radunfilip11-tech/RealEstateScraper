import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationFilter } from "@/lib/supabase/types";

// GET /api/notification-filters — list all notification filter rules
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;
    const { data, error } = await supabase
      .from("notification_filters")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filters: (data || []) as NotificationFilter[] });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

// POST /api/notification-filters — create a new rule
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name || !body.telegram_chat_id) {
      return NextResponse.json(
        { error: "name and telegram_chat_id are required" },
        { status: 400 },
      );
    }

    const row = {
      name: body.name,
      telegram_chat_id: body.telegram_chat_id,
      is_active: body.is_active ?? true,
      property_types: body.property_types ?? [],
      transaction_types: body.transaction_types ?? [],
      sources: body.sources ?? [],
      advertiser_types: body.advertiser_types ?? [],
      statuses: body.statuses ?? [],
      location_counties: body.location_counties ?? [],
      location_cities: body.location_cities ?? [],
      location_neighborhoods: body.location_neighborhoods ?? [],
      price_min: body.price_min ?? null,
      price_max: body.price_max ?? null,
      size_min: body.size_min ?? null,
      size_max: body.size_max ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;
    const { data, error } = await supabase
      .from("notification_filters")
      .insert([row])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filter: data as NotificationFilter });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

// PUT /api/notification-filters — update rule by id in body
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;
    const { data, error } = await supabase
      .from("notification_filters")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filter: data as NotificationFilter });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

// DELETE /api/notification-filters?id=... — delete rule by id in query string
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any;
    const { error } = await supabase
      .from("notification_filters")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
