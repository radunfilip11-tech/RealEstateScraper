import { NextResponse } from "next/server";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseBrowserClient() as any;

  let query = supabase.from("listings").select("*");

  // Apply filters from query params
  const sort = searchParams.get("sort") || "newest";
  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "price_asc":
      query = query.order("price_numeric", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("price_numeric", { ascending: false, nullsFirst: false });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }
  const source = searchParams.get("source");
  if (source) {
    query = query.eq("source", source);
  }

  const propertyType = searchParams.get("property_type");
  if (propertyType) {
    query = query.eq("property_type", propertyType);
  }

  const advertiserType = searchParams.get("advertiser_type");
  if (advertiserType) {
    query = query.eq("advertiser_type", advertiserType);
  }

  const priceMin = searchParams.get("price_min");
  if (priceMin) {
    query = query.gte("price_numeric", Number(priceMin));
  }

  const priceMax = searchParams.get("price_max");
  if (priceMax) {
    query = query.lte("price_numeric", Number(priceMax));
  }

  const sizeMin = searchParams.get("size_min");
  if (sizeMin) {
    query = query.gte("size_m2", Number(sizeMin));
  }

  const sizeMax = searchParams.get("size_max");
  if (sizeMax) {
    query = query.lte("size_m2", Number(sizeMax));
  }

  const search = searchParams.get("search");
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,external_id.ilike.%${search}%,location.ilike.%${search}%`
    );
  }

  const limit = searchParams.get("limit");
  query = query.limit(limit ? Number(limit) : 100);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
