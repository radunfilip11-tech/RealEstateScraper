"use client";

import { useState, useRef, useEffect } from "react";

interface PriceRangeFilterProps {
  id: string;
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
  onMinChange: (value: number | null) => void;
  onMaxChange: (value: number | null) => void;
}

export default function RangeFilter({
  id,
  label,
  unit,
  min,
  max,
  onMinChange,
  onMaxChange,
}: PriceRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasValue = min !== null || max !== null;
  const displayText = hasValue
    ? `${min ? min.toLocaleString("hr-HR") : "0"} - ${max ? max.toLocaleString("hr-HR") : "∞"} ${unit}`
    : label;

  return (
    <div ref={ref} className="relative" id={`filter-${id}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
          hasValue
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {displayText}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
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
        <div className="absolute top-full left-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[11px] text-gray-400 mb-1 font-medium">
                Min
              </label>
              <input
                type="number"
                value={min ?? ""}
                onChange={(e) =>
                  onMinChange(e.target.value ? Number(e.target.value) : null)
                }
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
            </div>
            <span className="text-gray-300 mt-5">–</span>
            <div className="flex-1">
              <label className="block text-[11px] text-gray-400 mb-1 font-medium">
                Max
              </label>
              <input
                type="number"
                value={max ?? ""}
                onChange={(e) =>
                  onMaxChange(e.target.value ? Number(e.target.value) : null)
                }
                placeholder="∞"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
            </div>
          </div>
          {hasValue && (
            <button
              onClick={() => {
                onMinChange(null);
                onMaxChange(null);
              }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Očisti
            </button>
          )}
        </div>
      )}
    </div>
  );
}
