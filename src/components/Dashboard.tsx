"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Listing } from "@/lib/supabase/types";
import { PROPERTY_TYPES, ADVERTISER_TYPES, SOURCES, TRANSACTION_TYPES, LISTING_STATUSES } from "@/lib/supabase/types";
import StatsBar from "@/components/ui/StatsBar";
import SearchBar from "@/components/ui/SearchBar";
import FilterDropdown from "@/components/ui/FilterDropdown";
import RangeFilter from "@/components/ui/RangeFilter";
import LocationFilterDropdown from "@/components/ui/LocationFilterDropdown";
import ListingCard from "@/components/ui/ListingCard";
export default function Dashboard() {
  // Data state
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);
  const [scrapePages, setScrapePages] = useState<number>(1);
  const [scrapeCounty, setScrapeCounty] = useState<string>("");

  // Filter state
  const [search, setSearch] = useState("");
  const [selectedCounties, setSelectedCounties] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>([]);
  const [selectedTransactionTypes, setSelectedTransactionTypes] = useState<string[]>([]);
  const [selectedAdvertiserTypes, setSelectedAdvertiserTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [sizeMin, setSizeMin] = useState<number | null>(null);
  const [sizeMax, setSizeMax] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("newest");

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

  // Fetch listings from Supabase
  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      let query = supabase.from("listings").select("*");

      // Apply sorting
      if (sort === "newest") query = query.order("created_at", { ascending: false });
      else if (sort === "oldest") query = query.order("created_at", { ascending: true });
      else if (sort === "price_asc") query = query.order("price_numeric", { ascending: true });
      else if (sort === "price_desc") query = query.order("price_numeric", { ascending: false });

      // Apply search filter
      if (search) {
        query = query.or(
          `title.ilike.%${search}%,external_id.ilike.%${search}%,location.ilike.%${search}%`
        );
      }

      // Apply multi-select filters
      if (selectedSources.length > 0) {
        query = query.in("source", selectedSources);
      }
      if (selectedPropertyTypes.length > 0) {
        query = query.in("property_type", selectedPropertyTypes);
      }
      if (selectedCounties.length > 0) {
        query = query.in("location_county", selectedCounties);
      }
      if (selectedCities.length > 0) {
        query = query.in("location_city", selectedCities);
      }
      if (selectedNeighborhoods.length > 0) {
        query = query.in("location_neighborhood", selectedNeighborhoods);
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

      const { data, error } = await query.limit(1000);

      if (error) {
        console.error("Error fetching listings:", error);
      } else {
        setListings(data || []);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
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
  ]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

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
          county: scrapeCounty || undefined
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
    selectedSources.length > 0,
    selectedPropertyTypes.length > 0,
    selectedAdvertiserTypes.length > 0,
    priceMin !== null || priceMax !== null,
    sizeMin !== null || sizeMax !== null,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch("");
    setSelectedCounties([]);
    setSelectedCities([]);
    setSelectedNeighborhoods([]);
    setSelectedSources([]);
    setSelectedPropertyTypes([]);
    setSelectedAdvertiserTypes([]);
    setPriceMin(null);
    setPriceMax(null);
    setSizeMin(null);
    setSizeMax(null);
    setSort("newest");
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
            Pregled svih skrapanih nekretnina
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={scrapeCounty}
            onChange={(e) => setScrapeCounty(e.target.value)}
            disabled={scraping}
            className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer w-44"
            title="Županija za skrapanje"
          >
            <option value="">Sve županije (Cijela HR)</option>
            
            <optgroup label="Makro regije">
              <option value="zadarska,sibensko-kninska,splitsko-dalmatinska,dubrovacko-neretvanska">Dalmacija</option>
              <option value="istarska,primorsko-goranska">Istra i Kvarner</option>
              <option value="osjecko-baranjska,vukovarsko-srijemska,brodsko-posavska,pozesko-slavonska,viroviticko-podravska">Slavonija</option>
            </optgroup>

            <optgroup label="Pojedinačne Županije">
              <option value="grad-zagreb">Grad Zagreb</option>
              <option value="zagrebacka">Zagrebačka</option>
              <option value="splitsko-dalmatinska">Splitsko-dalmatinska</option>
              <option value="primorsko-goranska">Primorsko-goranska</option>
              <option value="istarska">Istarska</option>
              <option value="zadarska">Zadarska</option>
              <option value="sibensko-kninska">Šibensko-kninska</option>
              <option value="dubrovacko-neretvanska">Dubrovačko-neretvanska</option>
              <option value="osjecko-baranjska">Osječko-baranjska</option>
              <option value="varazdinska">Varaždinska</option>
            </optgroup>
          </select>
          <select
            value={scrapePages}
            onChange={(e) => setScrapePages(Number(e.target.value))}
            disabled={scraping}
            className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer"
            title="Broj stranica za skrapanje (svaka stranica ima 35 oglasa)"
          >
            <option value={1}>1 stranica (Brzo)</option>
            <option value={2}>2 stranice</option>
            <option value={3}>3 stranice</option>
            <option value={5}>5 stranica (Duboko)</option>
            <option value={10}>10 stranica (Sveobuhvatno)</option>
          </select>
          <button
            id="scrape-button"
            onClick={handleScrape}
            disabled={scraping}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm hover:shadow"
          >
          {scraping ? (
            <>
              <svg
                className="animate-spin w-4 h-4"
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
              Skrapanje...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
                />
              </svg>
              Pokreni Scraper
            </>
          )}
        </button>
        </div>
      </div>

      {/* Scrape result banner */}
      {scrapeResult && (
        <div
          id="scrape-result"
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            scrapeResult.startsWith("✅")
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {scrapeResult}
        </div>
      )}

      {/* Stats */}
      <StatsBar
        newListings24h={newListings24h}
        privateListings24h={privateListings24h}
        totalListings={listings.length}
      />

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

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
            <option value="newest">Najnovije dodano</option>
            <option value="oldest">Najstarije dodano</option>
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
              Prikazano {listings.length} oglasa
            </p>
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onHide={() => handleHideListing(listing.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
