"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PROPERTY_TYPES,
  ADVERTISER_TYPES,
  SOURCES,
  TRANSACTION_TYPES,
  LISTING_STATUSES,
  type NotificationFilter,
} from "@/lib/supabase/types";
import FilterDropdown from "@/components/ui/FilterDropdown";
import RangeFilter from "@/components/ui/RangeFilter";
import LocationFilterDropdown from "@/components/ui/LocationFilterDropdown";

interface NotificationFilterFormProps {
  existing?: NotificationFilter | null;
  onClose: (refresh?: boolean) => void;
}

export default function NotificationFilterForm({
  existing,
  onClose,
}: NotificationFilterFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(existing?.name ?? "");
  const [chatId, setChatId] = useState(existing?.telegram_chat_id ?? "");
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);

  const [propertyTypes, setPropertyTypes] = useState<string[]>(
    existing?.property_types ?? [],
  );
  const [transactionTypes, setTransactionTypes] = useState<string[]>(
    existing?.transaction_types ?? [],
  );
  const [sources, setSources] = useState<string[]>(existing?.sources ?? []);
  const [advertiserTypes, setAdvertiserTypes] = useState<string[]>(
    existing?.advertiser_types ?? [],
  );
  const [statuses, setStatuses] = useState<string[]>(existing?.statuses ?? []);

  const [locationCounties, setLocationCounties] = useState<string[]>(
    existing?.location_counties ?? [],
  );
  const [locationCities, setLocationCities] = useState<string[]>(
    existing?.location_cities ?? [],
  );
  const [locationNeighborhoods, setLocationNeighborhoods] = useState<string[]>(
    existing?.location_neighborhoods ?? [],
  );

  const [priceMin, setPriceMin] = useState<number | null>(
    existing?.price_min ?? null,
  );
  const [priceMax, setPriceMax] = useState<number | null>(
    existing?.price_max ?? null,
  );
  const [sizeMin, setSizeMin] = useState<number | null>(
    existing?.size_min ?? null,
  );
  const [sizeMax, setSizeMax] = useState<number | null>(
    existing?.size_max ?? null,
  );

  // Fetch all unique locations for the LocationFilterDropdown
  const [allLocations, setAllLocations] = useState<
    { county: string | null; city: string | null; neighborhood: string | null }[]
  >([]);

  useEffect(() => {
    async function fetchLocations() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabaseBrowserClient() as any;
      const { data } = await supabase
        .from("listings")
        .select("location_county, location_city, location_neighborhood");
      if (data) {
        setAllLocations(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.map((row: any) => ({
            county: row.location_county,
            city: row.location_city,
            neighborhood: row.location_neighborhood,
          })),
        );
      }
    }
    fetchLocations();
  }, []);

  const [recentChatIds, setRecentChatIds] = useState<string[]>([]);

  useEffect(() => {
    async function fetchChatIds() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabaseBrowserClient() as any;
      const { data } = await supabase
        .from("notification_filters")
        .select("telegram_chat_id");
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unique = Array.from(new Set(data.map((d: any) => d.telegram_chat_id))).filter(Boolean) as string[];
        setRecentChatIds(unique);
      }
    }
    fetchChatIds();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      name: name.trim(),
      telegram_chat_id: chatId.trim(),
      is_active: isActive,
      property_types: propertyTypes,
      transaction_types: transactionTypes,
      sources: sources,
      advertiser_types: advertiserTypes,
      statuses: statuses,
      location_counties: locationCounties,
      location_cities: locationCities,
      location_neighborhoods: locationNeighborhoods,
      price_min: priceMin,
      price_max: priceMax,
      size_min: sizeMin,
      size_max: sizeMax,
    };

    try {
      const res = await fetch("/api/notification-filters", {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing ? { id: existing.id, ...payload } : payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nepoznata greška");
        setLoading(false);
        return;
      }

      onClose(true);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {existing ? "Uredi pravilo" : "Novo pravilo za obavijesti"}
          </h2>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-900 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 pb-32">
          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Basic info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Naziv pravila
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="npr. Stanovi u Zagrebu do 200k"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telegram Chat ID
              </label>
              <input
                required
                type="text"
                list="recent-chat-ids"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <datalist id="recent-chat-ids">
                {recentChatIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <p className="text-xs text-gray-500 mt-1">
                ID grupe ili chata (doznajte ga od @RawDataBot u Telegramu)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20"
              />
              <label
                htmlFor="is-active"
                className="text-sm text-gray-700 cursor-pointer"
              >
                Pravilo je aktivno (šalje obavijesti)
              </label>
            </div>
          </div>

          {/* Filters */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">
              Kriteriji filtera
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Ostavite prazno za &quot;bilo koje&quot;. Kombinacija se ponaša
              kao I (AND).
            </p>

            <div className="flex flex-wrap gap-2">
              <LocationFilterDropdown
                locations={allLocations}
                selectedCounties={locationCounties}
                selectedCities={locationCities}
                selectedNeighborhoods={locationNeighborhoods}
                onSelectionChange={(c, ci, n) => {
                  setLocationCounties(c);
                  setLocationCities(ci);
                  setLocationNeighborhoods(n);
                }}
              />

              <FilterDropdown
                label="Transakcija"
                options={[...TRANSACTION_TYPES]}
                selected={transactionTypes}
                onChange={setTransactionTypes}
              />

              <FilterDropdown
                label="Tip nekretnine"
                options={[...PROPERTY_TYPES]}
                selected={propertyTypes}
                onChange={setPropertyTypes}
              />

              <FilterDropdown
                label="Oglašivač"
                options={[...ADVERTISER_TYPES]}
                selected={advertiserTypes}
                onChange={setAdvertiserTypes}
              />

              <FilterDropdown
                label="Oglasnik"
                options={[...SOURCES]}
                selected={sources}
                onChange={setSources}
              />

              <FilterDropdown
                label="Status"
                options={[...LISTING_STATUSES]}
                selected={statuses}
                onChange={setStatuses}
              />

              <RangeFilter
                id="notif-price"
                label="Cijena (€)"
                unit="€"
                min={priceMin}
                max={priceMax}
                onMinChange={setPriceMin}
                onMaxChange={setPriceMax}
              />

              <RangeFilter
                id="notif-size"
                label="Kvadratura (m²)"
                unit="m²"
                min={sizeMin}
                max={sizeMax}
                onMinChange={setSizeMin}
                onMaxChange={setSizeMax}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Spremanje..."
                : existing
                  ? "Spremi promjene"
                  : "Spremi pravilo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
