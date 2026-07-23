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
  // Category-specific enriched fields
  room_count: number | null;
  floor_label: string | null;
  yard_size_m2: number | null;
  land_type: string | null;
  house_type: string | null;
  commercial_type: string | null;
  garage_type: string | null;
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

export interface SeenListing {
  external_id: string;
  advertiser_type: string | null;
  seen_at: string;
  worker_id: number | null;
}

export interface ScraperConfig {
  w1_interval_min: number;
  w2_interval_min: number;
  night_start_hour: number;
  night_end_hour: number;
  max_pages_per_category: number;
  workers_enabled: boolean;
}

export const DEFAULT_SCRAPER_CONFIG: ScraperConfig = {
  w1_interval_min: 30,
  w2_interval_min: 300,
  night_start_hour: 2,
  night_end_hour: 6,
  max_pages_per_category: 10,
  workers_enabled: true,
};

export interface NotificationFilter {
  id: string;
  name: string;
  telegram_chat_id: string;
  is_active: boolean;

  property_types: string[];
  transaction_types: string[];
  sources: string[];
  advertiser_types: string[];
  statuses: string[];

  location_counties: string[];
  location_cities: string[];
  location_neighborhoods: string[];

  price_min: number | null;
  price_max: number | null;
  size_min: number | null;
  size_max: number | null;

  // Category-specific filters
  room_count_min: number | null;
  room_count_max: number | null;
  land_types: string[];
  house_types: string[];
  commercial_types: string[];
  yard_size_min: number | null;
  yard_size_max: number | null;

  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationFilterInsert = Omit<
  NotificationFilter,
  "id" | "created_at" | "updated_at" | "last_notified_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  last_notified_at?: string | null;
};

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

export const LAND_TYPES = [
  "Građevinsko",
  "Poljoprivredno",
  "Šumsko",
  "Ostalo",
] as const;

export const HOUSE_TYPES = [
  "Samostojeća",
  "Dvojna",
  "Niz",
  "Ostalo",
] as const;

export const COMMERCIAL_TYPES = [
  "Ured",
  "Ugostiteljstvo",
  "Skladište",
  "Trgovina",
  "Salon",
  "Ostalo",
] as const;

export const GARAGE_TYPES = [
  "Garaža",
  "Garažno mjesto",
  "Vanjsko parkirno mjesto",
] as const;

export type LandType = (typeof LAND_TYPES)[number];
export type HouseType = (typeof HOUSE_TYPES)[number];
export type CommercialType = (typeof COMMERCIAL_TYPES)[number];
export type GarageType = (typeof GARAGE_TYPES)[number];

export const ADVERTISER_TYPES = ["Privatni", "Agencija"] as const;

export const SOURCES = ["njuskalo", "oglasnik"] as const;

export const TRANSACTION_TYPES = ["Prodaja", "Najam"] as const;

export const LISTING_STATUSES = ["Novi", "Obnovljen", "Istekao"] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type AdvertiserType = (typeof ADVERTISER_TYPES)[number];
export type Source = (typeof SOURCES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export interface FilterState {
  search: string;
  selectedCounties: string[];
  selectedCities: string[];
  selectedNeighborhoods: string[];
  selectedSources: string[];
  selectedPropertyTypes: string[];
  selectedTransactionTypes: string[];
  selectedAdvertiserTypes: string[];
  selectedStatuses: string[];
  showHidden: boolean;
  priceMin: number | null;
  priceMax: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
  sort: string;
  dateFrom: string;
  dateTo: string;
  dateField: 'published_at' | 'created_at';
  // Category-specific filters
  roomCountMin: number | null;
  roomCountMax: number | null;
  selectedLandTypes: string[];
  selectedHouseTypes: string[];
  selectedCommercialTypes: string[];
  yardSizeMin: number | null;
  yardSizeMax: number | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}
