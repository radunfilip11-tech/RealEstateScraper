// Database types matching the Supabase schema

export interface Listing {
  id: string;
  external_id: string;
  title: string;
  price: string | null;
  price_numeric: number | null;
  size_m2: number | null;
  location: string | null;
  location_region: string | null;
  location_county: string | null;
  location_city: string | null;
  location_neighborhood: string | null;
  property_type: string | null;
  transaction_type: string | null;
  advertiser_type: string | null;
  url: string;
  image_url: string | null;
  source: string;
  description: string | null;
  notified: boolean;
  status: string;
  hidden: boolean;
  is_promoted?: boolean;
  published_at?: string;
  created_at: string;
}

export interface ScrapeRun {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  listings_found: number;
  new_listings: number;
  status: "running" | "success" | "error";
  error_message: string | null;
}

export interface Buyer {
  id: string;
  name: string;
  contact: string | null;
  criteria: Record<string, any> | null;
  created_at: string;
}

// Insert types (without auto-generated fields)
export type ListingInsert = Omit<Listing, "id" | "created_at" | "notified"> & {
  notified?: boolean;
};

export type ScrapeRunInsert = Omit<ScrapeRun, "id"> & {
  id?: string;
};

export type BuyerInsert = Omit<Buyer, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

// Property type options for filters
export const PROPERTY_TYPES = [
  "Stan",
  "Kuća",
  "Poslovni prostor",
  "Zemljište",
  "Luksuzni stan",
  "Luksuzna kuća",
  "Novogradnja",
  "Vikendica",
  "Garaža",
  "Parkirno mjesto",
] as const;

export const ADVERTISER_TYPES = ["Privatni"] as const;

export const SOURCES = ["njuskalo"] as const;

export const TRANSACTION_TYPES = ["Prodaja", "Najam"] as const;

export const LISTING_STATUSES = ["Novi", "Obnovljen", "Istekao"] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type AdvertiserType = (typeof ADVERTISER_TYPES)[number];
export type Source = (typeof SOURCES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];
