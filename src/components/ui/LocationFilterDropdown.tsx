"use client";

import { useRef, useState, useEffect, useMemo } from "react";

interface Location {
  county: string | null;
  city: string | null;
  neighborhood: string | null;
}

interface LocationFilterDropdownProps {
  locations: Location[];
  selectedCounties: string[];
  selectedCities: string[];
  selectedNeighborhoods: string[];
  onSelectionChange: (
    counties: string[],
    cities: string[],
    neighborhoods: string[]
  ) => void;
}

export default function LocationFilterDropdown({
  locations,
  selectedCounties,
  selectedCities,
  selectedNeighborhoods,
  onSelectionChange,
}: LocationFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute unique lists from all locations based on search query
  const { counties, cities, neighborhoods } = useMemo(() => {
    const q = searchQuery.toLowerCase();

    const uniqueCounties = new Set<string>();
    const uniqueCities = new Set<string>();
    const uniqueNeighborhoods = new Set<string>();

    locations.forEach((loc) => {
      if (loc.county && loc.county.toLowerCase().includes(q)) {
        uniqueCounties.add(loc.county);
      }
      if (loc.city && loc.city.toLowerCase().includes(q)) {
        uniqueCities.add(loc.city);
      }
      if (loc.neighborhood && loc.neighborhood.toLowerCase().includes(q)) {
        uniqueNeighborhoods.add(loc.neighborhood);
      }
    });

    return {
      counties: Array.from(uniqueCounties).sort(),
      cities: Array.from(uniqueCities).sort(),
      neighborhoods: Array.from(uniqueNeighborhoods).sort(),
    };
  }, [locations, searchQuery]);

  const toggleCounty = (county: string) => {
    if (selectedCounties.includes(county)) {
      onSelectionChange(
        selectedCounties.filter((c) => c !== county),
        selectedCities,
        selectedNeighborhoods
      );
    } else {
      onSelectionChange(
        [...selectedCounties, county],
        selectedCities,
        selectedNeighborhoods
      );
    }
  };

  const toggleCity = (city: string) => {
    if (selectedCities.includes(city)) {
      onSelectionChange(
        selectedCounties,
        selectedCities.filter((c) => c !== city),
        selectedNeighborhoods
      );
    } else {
      onSelectionChange(selectedCounties, [...selectedCities, city], selectedNeighborhoods);
    }
  };

  const toggleNeighborhood = (neighborhood: string) => {
    if (selectedNeighborhoods.includes(neighborhood)) {
      onSelectionChange(
        selectedCounties,
        selectedCities,
        selectedNeighborhoods.filter((n) => n !== neighborhood)
      );
    } else {
      onSelectionChange(selectedCounties, selectedCities, [
        ...selectedNeighborhoods,
        neighborhood,
      ]);
    }
  };

  const clearAll = () => {
    onSelectionChange([], [], []);
    setSearchQuery("");
  };

  const totalSelected =
    selectedCounties.length + selectedCities.length + selectedNeighborhoods.length;

  const displayText =
    totalSelected === 0
      ? "Lokacija"
      : totalSelected === 1
      ? selectedCounties[0] || selectedCities[0] || selectedNeighborhoods[0]
      : `${totalSelected} odabrano`;

  return (
    <div ref={ref} className="relative" id="filter-location">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
          totalSelected > 0
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        {displayText}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Pretraži lokaciju..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto p-2">
            {totalSelected > 0 && (
              <div className="px-2 pb-2 mb-2 border-b border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-500 font-medium">
                    Odabrane lokacije: {totalSelected}
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Očisti sve
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCounties.map((county) => (
                    <span
                      key={`sel-county-${county}`}
                      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md"
                    >
                      <span className="truncate max-w-[180px]" title={county}>
                        {county}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCounty(county)}
                        className="p-0.5 rounded hover:bg-emerald-100 transition-colors"
                        aria-label={`Ukloni ${county}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  {selectedCities.map((city) => (
                    <span
                      key={`sel-city-${city}`}
                      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md"
                    >
                      <span className="truncate max-w-[180px]" title={city}>
                        {city}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCity(city)}
                        className="p-0.5 rounded hover:bg-emerald-100 transition-colors"
                        aria-label={`Ukloni ${city}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  {selectedNeighborhoods.map((neighborhood) => (
                    <span
                      key={`sel-neighborhood-${neighborhood}`}
                      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md"
                    >
                      <span className="truncate max-w-[180px]" title={neighborhood}>
                        {neighborhood}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleNeighborhood(neighborhood)}
                        className="p-0.5 rounded hover:bg-emerald-100 transition-colors"
                        aria-label={`Ukloni ${neighborhood}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {counties.length === 0 && cities.length === 0 && neighborhoods.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                Nema rezultata za &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="space-y-4">
                {counties.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Županija
                    </div>
                    {counties.map((county) => (
                      <label
                        key={`county-${county}`}
                        className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCounties.includes(county)}
                          onChange={() => toggleCounty(county)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20 transition-colors"
                        />
                        <span className="text-sm text-gray-700">{county}</span>
                      </label>
                    ))}
                  </div>
                )}

                {cities.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Grad/Općina
                    </div>
                    {cities.map((city) => (
                      <label
                        key={`city-${city}`}
                        className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCities.includes(city)}
                          onChange={() => toggleCity(city)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20 transition-colors"
                        />
                        <span className="text-sm text-gray-700">{city}</span>
                      </label>
                    ))}
                  </div>
                )}

                {neighborhoods.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Kvart
                    </div>
                    {neighborhoods.map((neighborhood) => (
                      <label
                        key={`neighborhood-${neighborhood}`}
                        className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedNeighborhoods.includes(neighborhood)}
                          onChange={() => toggleNeighborhood(neighborhood)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20 transition-colors"
                        />
                        <span className="text-sm text-gray-700">{neighborhood}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
