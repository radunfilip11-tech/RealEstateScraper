'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FilterState, FilterPreset } from '@/lib/supabase/types';

const PRESETS_KEY = 'nekretnine_filter_presets';
const LAST_FILTERS_KEY = 'nekretnine_last_filters';

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  selectedCounties: [],
  selectedCities: [],
  selectedNeighborhoods: [],
  selectedSources: [],
  selectedPropertyTypes: [],
  selectedTransactionTypes: [],
  selectedAdvertiserTypes: [],
  selectedStatuses: [],
  showHidden: false,
  priceMin: null,
  priceMax: null,
  sizeMin: null,
  sizeMax: null,
  sort: 'newest',
  dateFrom: '',
  dateTo: '',
  dateField: 'published_at',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — ignore
  }
}

export function useFilterPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    setPresets(loadFromStorage<FilterPreset[]>(PRESETS_KEY, []));
    initialized.current = true;
  }, []);

  useEffect(() => {
    if (initialized.current) {
      saveToStorage(PRESETS_KEY, presets);
    }
  }, [presets]);

  const savePreset = useCallback(
    (name: string, filters: FilterState) => {
      const preset: FilterPreset = {
        id: crypto.randomUUID(),
        name,
        filters,
        createdAt: new Date().toISOString(),
      };
      setPresets((prev) => [...prev, preset]);
      setActivePresetId(preset.id);
      return preset;
    },
    [],
  );

  const updatePreset = useCallback(
    (id: string, filters: FilterState) => {
      setPresets((prev) =>
        prev.map((p) => (p.id === id ? { ...p, filters } : p)),
      );
    },
    [],
  );

  const renamePreset = useCallback((id: string, name: string) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p)),
    );
  }, []);

  const deletePreset = useCallback(
    (id: string) => {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (activePresetId === id) setActivePresetId(null);
    },
    [activePresetId],
  );

  return {
    presets,
    activePresetId,
    setActivePresetId,
    savePreset,
    updatePreset,
    renamePreset,
    deletePreset,
  };
}

export function getLastFilters(): FilterState {
  return loadFromStorage<FilterState>(LAST_FILTERS_KEY, DEFAULT_FILTERS);
}

export function persistLastFilters(filters: FilterState) {
  saveToStorage(LAST_FILTERS_KEY, filters);
}
