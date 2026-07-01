'use client';

import { useState, useRef, useEffect } from 'react';
import type { FilterPreset, FilterState } from '@/lib/supabase/types';

interface SavedFiltersBarProps {
  presets: FilterPreset[];
  activePresetId: string | null;
  onSave: (name: string) => void;
  onLoad: (preset: FilterPreset) => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  hasActiveFilters: boolean;
}

export default function SavedFiltersBar({
  presets,
  activePresetId,
  onSave,
  onLoad,
  onUpdate,
  onDelete,
  onRename,
  hasActiveFilters,
}: SavedFiltersBarProps) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSaveInput) saveInputRef.current?.focus();
  }, [showSaveInput]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpenId]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleRename = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    onRename(id, name);
    setEditingId(null);
    setEditName('');
  };

  const filterSummary = (f: FilterState) => {
    const parts: string[] = [];
    if (f.selectedTransactionTypes.length)
      parts.push(f.selectedTransactionTypes.join(', '));
    if (f.selectedPropertyTypes.length)
      parts.push(f.selectedPropertyTypes.join(', '));
    if (f.selectedCounties.length)
      parts.push(f.selectedCounties.join(', '));
    if (f.priceMin !== null || f.priceMax !== null) {
      const min = f.priceMin ? `${(f.priceMin / 1000).toFixed(0)}k` : '0';
      const max = f.priceMax ? `${(f.priceMax / 1000).toFixed(0)}k` : '';
      parts.push(`${min}–${max || '...'}€`);
    }
    if (f.sizeMin !== null || f.sizeMax !== null) {
      const min = f.sizeMin ?? '0';
      const max = f.sizeMax ?? '...';
      parts.push(`${min}–${max}m²`);
    }
    return parts.length ? parts.join(' · ') : 'Svi filteri prazni';
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset chips */}
      {presets.map((preset) => {
        const isActive = preset.id === activePresetId;

        if (editingId === preset.id) {
          return (
            <form
              key={preset.id}
              onSubmit={(e) => {
                e.preventDefault();
                handleRename(preset.id);
              }}
              className="inline-flex"
            >
              <input
                ref={editInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  setEditingId(null);
                  setEditName('');
                }}
                className="text-xs border border-emerald-400 rounded-lg px-3 py-1.5 w-32 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Novi naziv..."
              />
            </form>
          );
        }

        return (
          <div key={preset.id} className="relative inline-flex group">
            <button
              onClick={() => onLoad(preset)}
              title={filterSummary(preset.filters)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg
                className="w-3 h-3 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              {preset.name}
            </button>

            <button
              onClick={() =>
                setMenuOpenId(menuOpenId === preset.id ? null : preset.id)
              }
              className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-gray-300 text-gray-600 hover:bg-gray-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] leading-none"
            >
              ...
            </button>

            {menuOpenId === preset.id && (
              <div
                ref={menuRef}
                className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
              >
                <button
                  onClick={() => {
                    onUpdate(preset.id);
                    setMenuOpenId(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Ažuriraj
                </button>
                <button
                  onClick={() => {
                    setEditingId(preset.id);
                    setEditName(preset.name);
                    setMenuOpenId(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                    />
                  </svg>
                  Preimenuj
                </button>
                <button
                  onClick={() => {
                    onDelete(preset.id);
                    setMenuOpenId(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Obriši
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Save new preset */}
      {showSaveInput ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="inline-flex items-center gap-1.5"
        >
          <input
            ref={saveInputRef}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-40 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Naziv filtera..."
          />
          <button
            type="submit"
            disabled={!saveName.trim()}
            className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
          >
            Spremi
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSaveInput(false);
              setSaveName('');
            }}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            Odustani
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowSaveInput(true)}
          disabled={!hasActiveFilters}
          title={
            hasActiveFilters
              ? 'Spremi trenutne filtere kao preset'
              : 'Nema aktivnih filtera za spremiti'
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 border border-dashed border-gray-300 hover:border-emerald-300 disabled:opacity-40 disabled:hover:text-gray-500 disabled:hover:bg-transparent disabled:hover:border-gray-300 transition-all duration-150"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Spremi filter
        </button>
      )}
    </div>
  );
}
