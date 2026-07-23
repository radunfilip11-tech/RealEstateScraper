"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Listing, FilterState } from "@/lib/supabase/types";
import { PROPERTY_TYPES, ADVERTISER_TYPES, SOURCES, TRANSACTION_TYPES, LISTING_STATUSES, LAND_TYPES, HOUSE_TYPES, COMMERCIAL_TYPES } from "@/lib/supabase/types";
import StatsBar from "@/components/ui/StatsBar";
import SearchBar from "@/components/ui/SearchBar";
import FilterDropdown from "@/components/ui/FilterDropdown";
import RangeFilter from "@/components/ui/RangeFilter";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import LocationFilterDropdown from "@/components/ui/LocationFilterDropdown";
import ListingCard from "@/components/ui/ListingCard";
import SavedFiltersBar from "@/components/ui/SavedFiltersBar";
import {
  useFilterPresets,
  getLastFilters,
  persistLastFilters,
  DEFAULT_FILTERS,
} from "@/hooks/useFilterPresets";
export default function Dashboard() {
  // Data state
  const [listings, setListings] = useState<Listing[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);
  const [scrapePages, setScrapePages] = useState<number>(1);
  const [scrapeCounty, setScrapeCounty] = useState<string>("");
  const [scrapeCategory, setScrapeCategory] = useState<string>("");

  // Filter state — start with defaults, restored from localStorage in useEffect
  const [search, setSearch] = useState(DEFAULT_FILTERS.search);
  const [selectedCounties, setSelectedCounties] = useState<string[]>(DEFAULT_FILTERS.selectedCounties);
  const [selectedCities, setSelectedCities] = useState<string[]>(DEFAULT_FILTERS.selectedCities);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(DEFAULT_FILTERS.selectedNeighborhoods);
  const [selectedSources, setSelectedSources] = useState<string[]>(DEFAULT_FILTERS.selectedSources);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>(DEFAULT_FILTERS.selectedPropertyTypes);
  const [selectedTransactionTypes, setSelectedTransactionTypes] = useState<string[]>(DEFAULT_FILTERS.selectedTransactionTypes);
  const [selectedAdvertiserTypes, setSelectedAdvertiserTypes] = useState<string[]>(DEFAULT_FILTERS.selectedAdvertiserTypes);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(DEFAULT_FILTERS.selectedStatuses);
  const [showHidden, setShowHidden] = useState(DEFAULT_FILTERS.showHidden);
  const [priceMin, setPriceMin] = useState<number | null>(DEFAULT_FILTERS.priceMin);
  const [priceMax, setPriceMax] = useState<number | null>(DEFAULT_FILTERS.priceMax);
  const [sizeMin, setSizeMin] = useState<number | null>(DEFAULT_FILTERS.sizeMin);
  const [sizeMax, setSizeMax] = useState<number | null>(DEFAULT_FILTERS.sizeMax);
  const [sort, setSort] = useState<string>(DEFAULT_FILTERS.sort);
  const [dateFrom, setDateFrom] = useState<string>(DEFAULT_FILTERS.dateFrom);
  const [dateTo, setDateTo] = useState<string>(DEFAULT_FILTERS.dateTo);
  const [dateField, setDateField] = useState<"published_at" | "created_at">(DEFAULT_FILTERS.dateField);
  // Category-specific filter state
  const [roomCountMin, setRoomCountMin] = useState<number | null>(DEFAULT_FILTERS.roomCountMin);
  const [roomCountMax, setRoomCountMax] = useState<number | null>(DEFAULT_FILTERS.roomCountMax);
  const [selectedLandTypes, setSelectedLandTypes] = useState<string[]>(DEFAULT_FILTERS.selectedLandTypes);
  const [selectedHouseTypes, setSelectedHouseTypes] = useState<string[]>(DEFAULT_FILTERS.selectedHouseTypes);
  const [selectedCommercialTypes, setSelectedCommercialTypes] = useState<string[]>(DEFAULT_FILTERS.selectedCommercialTypes);
  const [yardSizeMin, setYardSizeMin] = useState<number | null>(DEFAULT_FILTERS.yardSizeMin);
  const [yardSizeMax, setYardSizeMax] = useState<number | null>(DEFAULT_FILTERS.yardSizeMax);
  // State (not ref) so the persist effect's closure reliably sees `false` on the
  // first commit and doesn't overwrite saved localStorage with defaults.
  const [filtersRestored, setFiltersRestored] = useState(false);

  // Saved filter presets
  const {
    presets,
    activePresetId,
    setActivePresetId,
    savePreset,
    updatePreset,
    renamePreset,
    deletePreset,
  } = useFilterPresets();

  // All known locations for the autocomplete dropdown
  const [allLocations, setAllLocations] = useState<
    { county: string | null; city: string | null; neighborhood: string | null }[]
  >([]);

  // Fetch all unique locations once
  useEffect(() => {
    async function fetchLocations() {
      const supabase = getSupabaseBrowserClient() as any;
      const { data } = await supabase
        .from("listings")
        .select("location_county, location_city, location_neighborhood");
      if (data) {
        setAllLocations(
          data.map((row: any) => ({
            county: row.location_county,
            city: row.location_city,
            neighborhood: row.location_neighborhood,
          }))
        );
      }
    }
    fetchLocations();
  }, []);

  // Build current filter state snapshot
  const getCurrentFilters = useCallback((): FilterState => ({
    search,
    selectedCounties,
    selectedCities,
    selectedNeighborhoods,
    selectedSources,
    selectedPropertyTypes,
    selectedTransactionTypes,
    selectedAdvertiserTypes,
    selectedStatuses,
    showHidden,
    priceMin,
    priceMax,
    sizeMin,
    sizeMax,
    sort,
    dateFrom,
    dateTo,
    dateField,
    roomCountMin,
    roomCountMax,
    selectedLandTypes,
    selectedHouseTypes,
    selectedCommercialTypes,
    yardSizeMin,
    yardSizeMax,
  }), [
    search, selectedCounties, selectedCities, selectedNeighborhoods,
    selectedSources, selectedPropertyTypes, selectedTransactionTypes,
    selectedAdvertiserTypes, selectedStatuses, showHidden,
    priceMin, priceMax, sizeMin, sizeMax, sort, dateFrom, dateTo, dateField,
    roomCountMin, roomCountMax, selectedLandTypes, selectedHouseTypes, selectedCommercialTypes,
    yardSizeMin, yardSizeMax,
  ]);

  // Restore last used filters from localStorage after first render (avoids hydration mismatch)
  useEffect(() => {
    const saved = getLastFilters();
    const isDifferent = JSON.stringify(saved) !== JSON.stringify(DEFAULT_FILTERS);
    if (isDifferent) {
      setSearch(saved.search);
      setSelectedCounties(saved.selectedCounties);
      setSelectedCities(saved.selectedCities);
      setSelectedNeighborhoods(saved.selectedNeighborhoods);
      setSelectedSources(saved.selectedSources);
      setSelectedPropertyTypes(saved.selectedPropertyTypes);
      setSelectedTransactionTypes(saved.selectedTransactionTypes);
      setSelectedAdvertiserTypes(saved.selectedAdvertiserTypes);
      setSelectedStatuses(saved.selectedStatuses);
      setShowHidden(saved.showHidden);
      setPriceMin(saved.priceMin);
      setPriceMax(saved.priceMax);
      setSizeMin(saved.sizeMin);
      setSizeMax(saved.sizeMax);
      setSort(saved.sort);
      setDateFrom(saved.dateFrom);
      setDateTo(saved.dateTo);
      setDateField(saved.dateField);
      setRoomCountMin(saved.roomCountMin ?? null);
      setRoomCountMax(saved.roomCountMax ?? null);
      setSelectedLandTypes(saved.selectedLandTypes ?? []);
      setSelectedHouseTypes(saved.selectedHouseTypes ?? []);
      setSelectedCommercialTypes(saved.selectedCommercialTypes ?? []);
      setYardSizeMin(saved.yardSizeMin ?? null);
      setYardSizeMax(saved.yardSizeMax ?? null);
    }
    setFiltersRestored(true);
  }, []);

  // Auto-persist last used filters to localStorage (skip until restore is done)
  useEffect(() => {
    if (!filtersRestored) return;
    persistLastFilters(getCurrentFilters());
  }, [filtersRestored, getCurrentFilters]);

  // Apply a filter preset or snapshot
  const applyFilters = useCallback((f: FilterState) => {
    setSearch(f.search);
    setSelectedCounties(f.selectedCounties);
    setSelectedCities(f.selectedCities);
    setSelectedNeighborhoods(f.selectedNeighborhoods);
    setSelectedSources(f.selectedSources);
    setSelectedPropertyTypes(f.selectedPropertyTypes);
    setSelectedTransactionTypes(f.selectedTransactionTypes);
    setSelectedAdvertiserTypes(f.selectedAdvertiserTypes);
    setSelectedStatuses(f.selectedStatuses);
    setShowHidden(f.showHidden);
    setPriceMin(f.priceMin);
    setPriceMax(f.priceMax);
    setSizeMin(f.sizeMin);
    setSizeMax(f.sizeMax);
    setSort(f.sort);
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
    setDateField(f.dateField);
    setRoomCountMin(f.roomCountMin ?? null);
    setRoomCountMax(f.roomCountMax ?? null);
    setSelectedLandTypes(f.selectedLandTypes ?? []);
    setSelectedHouseTypes(f.selectedHouseTypes ?? []);
    setSelectedCommercialTypes(f.selectedCommercialTypes ?? []);
    setYardSizeMin(f.yardSizeMin ?? null);
    setYardSizeMax(f.yardSizeMax ?? null);
  }, []);

  const latestFetchId = useRef<number>(0);

  // Fetch listings from Supabase
  const fetchListings = useCallback(async () => {
    const fetchId = Date.now() + Math.random();
    latestFetchId.current = fetchId;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      let query = supabase.from("listings").select("*");

      // Apply sorting
      if (sort === "newest") query = query.order("created_at", { ascending: false });
      else if (sort === "oldest") query = query.order("created_at", { ascending: true });
      else if (sort === "published_newest") query = query.order("published_at", { ascending: false, nullsFirst: false });
      else if (sort === "published_oldest") query = query.order("published_at", { ascending: true, nullsFirst: false });
      else if (sort === "price_asc") query = query.order("price_numeric", { ascending: true });
      else if (sort === "price_desc") query = query.order("price_numeric", { ascending: false });

      // Apply search filter
      if (search) {
        // Escape quotes to prevent syntax errors in PostgREST when search contains commas
        const safeSearch = search.replace(/"/g, '""');
        query = query.or(
          `title.ilike."%${safeSearch}%",external_id.ilike."%${safeSearch}%",location.ilike."%${safeSearch}%"`
        );
      }

      // Apply multi-select filters
      if (selectedSources.length > 0) {
        query = query.in("source", selectedSources);
      }
      if (selectedPropertyTypes.length > 0) {
        query = query.in("property_type", selectedPropertyTypes);
      }
      
      // Apply location filters using OR logic
      // We must quote the values manually because .or() takes a raw string and commas in values would break it
      const locationConditions = [];
      if (selectedCounties.length > 0) {
        const quoted = selectedCounties.map(c => `"${c.replace(/"/g, '""')}"`);
        locationConditions.push(`location_county.in.(${quoted.join(',')})`);
      }
      if (selectedCities.length > 0) {
        const quoted = selectedCities.map(c => `"${c.replace(/"/g, '""')}"`);
        locationConditions.push(`location_city.in.(${quoted.join(',')})`);
      }
      if (selectedNeighborhoods.length > 0) {
        const quoted = selectedNeighborhoods.map(c => `"${c.replace(/"/g, '""')}"`);
        locationConditions.push(`location_neighborhood.in.(${quoted.join(',')})`);
      }
      if (locationConditions.length > 0) {
        query = query.or(locationConditions.join(','));
      }
      if (selectedTransactionTypes.length > 0) {
        query = query.in("transaction_type", selectedTransactionTypes);
      }
      if (selectedAdvertiserTypes.length > 0) {
        query = query.in("advertiser_type", selectedAdvertiserTypes);
      }
      if (selectedStatuses.length > 0) {
        query = query.in("status", selectedStatuses);
      }
      if (!showHidden) {
        query = query.eq("hidden", false);
      }

      // Apply range filters
      if (priceMin !== null) {
        query = query.gte("price_numeric", priceMin);
      }
      if (priceMax !== null) {
        query = query.lte("price_numeric", priceMax);
      }
      if (sizeMin !== null) {
        query = query.gte("size_m2", sizeMin);
      }
      if (sizeMax !== null) {
        query = query.lte("size_m2", sizeMax);
      }

      // Category-specific filters
      if (roomCountMin !== null) query = query.gte("room_count", roomCountMin);
      if (roomCountMax !== null) query = query.lte("room_count", roomCountMax);
      if (selectedLandTypes.length > 0) query = query.in("land_type", selectedLandTypes);
      if (selectedHouseTypes.length > 0) query = query.in("house_type", selectedHouseTypes);
      if (selectedCommercialTypes.length > 0) query = query.in("commercial_type", selectedCommercialTypes);
      if (yardSizeMin !== null) query = query.gte("yard_size_m2", yardSizeMin);
      if (yardSizeMax !== null) query = query.lte("yard_size_m2", yardSizeMax);

      // Apply date/time range filter
      if (dateFrom) {
        query = query.gte(dateField, new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        query = query.lte(dateField, new Date(dateTo).toISOString());
      }

      const { data, error } = await query.limit(1000);

      if (latestFetchId.current !== fetchId) return;

      if (error) {
        console.error("Error fetching listings:", JSON.stringify(error, null, 2));
      } else {
        setListings(data || []);
        setVisibleCount(50);
      }
    } catch (err) {
      if (latestFetchId.current !== fetchId) return;
      console.error("Fetch error:", err);
    } finally {
      if (latestFetchId.current === fetchId) {
        setLoading(false);
      }
    }
  }, [
    search,
    selectedCounties,
    selectedCities,
    selectedNeighborhoods,
    selectedSources,
    selectedPropertyTypes,
    selectedTransactionTypes,
    selectedAdvertiserTypes,
    selectedStatuses,
    showHidden,
    priceMin,
    priceMax,
    sizeMin,
    sizeMax,
    sort,
    dateFrom,
    dateTo,
    dateField,
    roomCountMin,
    roomCountMax,
    selectedLandTypes,
    selectedHouseTypes,
    selectedCommercialTypes,
    yardSizeMin,
    yardSizeMax,
  ]);

  useEffect(() => {
    if (!filtersRestored) return;
    fetchListings();
  }, [fetchListings, filtersRestored]);

  // Trigger scrape
  const handleScrape = async () => {
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/scrape", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pages: scrapePages,
          county: scrapeCounty || undefined,
          categories: scrapeCategory ? [scrapeCategory] : undefined
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setScrapeResult(
          `✅ Pronađeno ${data.listings_found} oglasa, ${data.new_listings} novih!`
        );
        fetchListings();
      } else {
        setScrapeResult(`❌ Greška: ${data.error || "Nepoznata greška"}`);
      }
    } catch (err) {
      setScrapeResult(`❌ Greška pri povezivanju: ${(err as Error).message}`);
    } finally {
      setScraping(false);
    }
  };

  // Stats calculations
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const newListings24h = listings.filter(
    (l) => new Date(l.created_at) > twentyFourHoursAgo
  ).length;

  const privateListings24h = listings.filter(
    (l) =>
      new Date(l.created_at) > twentyFourHoursAgo &&
      l.advertiser_type === "Privatni"
  ).length;

  const activeFilterCount = [
    search.length > 0,
    selectedCounties.length > 0,
    selectedCities.length > 0,
    selectedNeighborhoods.length > 0,
    selectedTransactionTypes.length > 0,
    selectedSources.length > 0,
    selectedPropertyTypes.length > 0,
    selectedAdvertiserTypes.length > 0,
    selectedStatuses.length > 0,
    priceMin !== null || priceMax !== null,
    sizeMin !== null || sizeMax !== null,
    dateFrom !== "" || dateTo !== "",
    roomCountMin !== null || roomCountMax !== null,
    selectedLandTypes.length > 0,
    selectedHouseTypes.length > 0,
    selectedCommercialTypes.length > 0,
    yardSizeMin !== null || yardSizeMax !== null,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    applyFilters(DEFAULT_FILTERS);
    setActivePresetId(null);
  };

  // Handle hide listing
  const handleHideListing = async (id: string) => {
    try {
      const supabase = getSupabaseBrowserClient() as any;
      const { error } = await supabase
        .from("listings")
        .update({ hidden: true })
        .eq("id", id);
        
      if (!error) {
        if (!showHidden) {
          setListings((prev) => prev.filter((l) => l.id !== id));
        } else {
          setListings((prev) => prev.map((l) => l.id === id ? { ...l, hidden: true } : l));
        }
      }
    } catch (e) {
      console.error("Failed to hide listing:", e);
    }
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Oglasi</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Pregled svih skeniranih nekretnina
          </p>
        </div>
      </div>

      {/* Stats */}
      <StatsBar
        newListings24h={newListings24h}
        privateListings24h={privateListings24h}
        totalListings={listings.length}
      />

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Saved filter presets */}
      <div className="mb-4">
        <SavedFiltersBar
          presets={presets}
          activePresetId={activePresetId}
          hasActiveFilters={activeFilterCount > 0}
          onSave={(name) => savePreset(name, getCurrentFilters())}
          onLoad={(preset) => {
            applyFilters(preset.filters);
            setActivePresetId(preset.id);
          }}
          onUpdate={(id) => updatePreset(id, getCurrentFilters())}
          onDelete={deletePreset}
          onRename={renamePreset}
        />
      </div>

      {/* Filters */}
      <div
        id="filters-bar"
        className="flex items-center gap-2 flex-wrap mb-6"
      >
        <LocationFilterDropdown
          locations={allLocations}
          selectedCounties={selectedCounties}
          selectedCities={selectedCities}
          selectedNeighborhoods={selectedNeighborhoods}
          onSelectionChange={(c, ci, n) => {
            setSelectedCounties(c);
            setSelectedCities(ci);
            setSelectedNeighborhoods(n);
          }}
        />

        <FilterDropdown
          label="Transakcija"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          }
          options={[...TRANSACTION_TYPES]}
          selected={selectedTransactionTypes}
          onChange={setSelectedTransactionTypes}
        />
        <FilterDropdown
          id="source"
          label="Oglasnik"
          options={[...SOURCES]}
          selected={selectedSources}
          onChange={setSelectedSources}
        />
        <FilterDropdown
          id="advertiser"
          label="Oglašivač"
          options={[...ADVERTISER_TYPES]}
          selected={selectedAdvertiserTypes}
          onChange={setSelectedAdvertiserTypes}
        />
        <FilterDropdown
          id="status"
          label="Status"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143z" />
            </svg>
          }
          options={[...LISTING_STATUSES]}
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
        />
        <FilterDropdown
          id="property-type"
          label="Tip nekretnine"
          options={[...PROPERTY_TYPES]}
          selected={selectedPropertyTypes}
          onChange={setSelectedPropertyTypes}
        />
        <RangeFilter
          id="price"
          label="Cijena (€)"
          unit="€"
          min={priceMin}
          max={priceMax}
          onMinChange={setPriceMin}
          onMaxChange={setPriceMax}
        />
        <RangeFilter
          id="size"
          label="Kvadratura (m²)"
          unit="m²"
          min={sizeMin}
          max={sizeMax}
          onMinChange={setSizeMin}
          onMaxChange={setSizeMax}
        />

        {/* --- Conditional category-specific filters --- */}

        {/* Rooms: show when Stan, Kuća, Vikendica, Luksuzni stan, Luksuzna kuća, Novogradnja selected */}
        {(selectedPropertyTypes.length === 0 ||
          selectedPropertyTypes.some(t => ["Stan", "Kuća", "Vikendica", "Luksuzni stan", "Luksuzna kuća", "Novogradnja"].includes(t))) && (
          <RangeFilter
            id="rooms"
            label="Sobe"
            unit="sob."
            min={roomCountMin}
            max={roomCountMax}
            onMinChange={setRoomCountMin}
            onMaxChange={setRoomCountMax}
          />
        )}

        {/* Land type: show when Zemljište selected */}
        {(selectedPropertyTypes.length === 0 ||
          selectedPropertyTypes.includes("Zemljište")) && (
          <FilterDropdown
            id="land-type"
            label="Tip zemljišta"
            options={[...LAND_TYPES]}
            selected={selectedLandTypes}
            onChange={setSelectedLandTypes}
          />
        )}

        {/* House type: show when Kuća, Vikendica, or Luksuzna kuća selected */}
        {(selectedPropertyTypes.some(t => ["Kuća", "Vikendica", "Luksuzna kuća"].includes(t))) && (
          <FilterDropdown
            id="house-type"
            label="Tip kuće"
            options={[...HOUSE_TYPES]}
            selected={selectedHouseTypes}
            onChange={setSelectedHouseTypes}
          />
        )}

        {/* Yard size: show when Kuća, Vikendica, or Luksuzna kuća selected */}
        {(selectedPropertyTypes.some(t => ["Kuća", "Vikendica", "Luksuzna kuća"].includes(t))) && (
          <RangeFilter
            id="yard-size"
            label="Okućnica (m²)"
            unit="m²"
            min={yardSizeMin}
            max={yardSizeMax}
            onMinChange={setYardSizeMin}
            onMaxChange={setYardSizeMax}
          />
        )}

        {/* Commercial type: show when Poslovni prostor selected */}
        {(selectedPropertyTypes.some(t => t === "Poslovni prostor")) && (
          <FilterDropdown
            id="commercial-type"
            label="Namjena prostora"
            options={[...COMMERCIAL_TYPES]}
            selected={selectedCommercialTypes}
            onChange={setSelectedCommercialTypes}
          />
        )}


        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          dateField={dateField}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onDateFieldChange={setDateField}
        />
        
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-600 flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Prikaži skrivene oglase
          </label>
        </div>
        
        <div className="flex-1"></div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Poredak:</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
          >
            <option value="newest">Najnovije dodano (skenirano)</option>
            <option value="oldest">Najstarije dodano (skenirano)</option>
            <option value="published_newest">Najnovije objavljeno (na sajtu)</option>
            <option value="published_oldest">Najstarije objavljeno (na sajtu)</option>
            <option value="price_asc">Najjeftinije</option>
            <option value="price_desc">Najskuplje</option>
          </select>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Očisti ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Listings */}
      <div id="listings-container">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              className="animate-spin w-8 h-8 text-emerald-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm text-gray-500">Učitavanje oglasa...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Nema oglasa
            </h3>
            <p className="text-xs text-gray-500 max-w-[260px]">
              Pokrenite scraper klikom na gumb &quot;Pokreni Scraper&quot; da
              dohvatite oglase s Njuškala.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 font-medium mb-2">
              Prikazano {Math.min(visibleCount, listings.length)} od ukupno {listings.length} oglasa
            </p>
            {listings.slice(0, visibleCount).map((listing) => (
              <ListingCard key={listing.id} listing={listing} onHide={() => handleHideListing(listing.id)} />
            ))}
            
            {visibleCount < listings.length && (
              <div className="flex justify-center pt-4 pb-8">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 50)}
                  className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
                >
                  Učitaj više (još 50)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
