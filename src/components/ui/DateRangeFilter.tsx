"use client";

import { useState, useRef, useEffect } from "react";

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  dateField: "published_at" | "created_at";
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onDateFieldChange: (value: "published_at" | "created_at") => void;
}

export default function DateRangeFilter({
  dateFrom,
  dateTo,
  dateField,
  onDateFromChange,
  onDateToChange,
  onDateFieldChange,
}: DateRangeFilterProps) {
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

  const hasValue = dateFrom !== "" || dateTo !== "";

  const formatDisplay = () => {
    if (!hasValue) return "Datum";
    const fieldLabel = dateField === "published_at" ? "Objav." : "Sken.";
    const from = dateFrom ? new Date(dateFrom).toLocaleDateString("hr-HR") : "...";
    const to = dateTo ? new Date(dateTo).toLocaleDateString("hr-HR") : "...";
    return `${fieldLabel} ${from} – ${to}`;
  };

  return (
    <div ref={ref} className="relative" id="filter-date">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
          hasValue
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {formatDisplay()}
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
        <div className="absolute top-full left-0 mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="mb-3">
            <label className="block text-[11px] text-gray-400 mb-1.5 font-medium">
              Filtriraj prema
            </label>
            <select
              value={dateField}
              onChange={(e) => onDateFieldChange(e.target.value as "published_at" | "created_at")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
            >
              <option value="published_at">Datum objave (na sajtu)</option>
              <option value="created_at">Datum skeniranja</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[11px] text-gray-400 mb-1 font-medium">
                Od
              </label>
              <input
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
            </div>
            <span className="text-gray-300 mt-5">–</span>
            <div className="flex-1">
              <label className="block text-[11px] text-gray-400 mb-1 font-medium">
                Do
              </label>
              <input
                type="datetime-local"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
            </div>
          </div>

          {hasValue && (
            <button
              onClick={() => {
                onDateFromChange("");
                onDateToChange("");
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
