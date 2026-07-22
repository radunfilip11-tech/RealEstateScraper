"use client";

import { useState, useRef, useEffect } from "react";
import TimeInput from "@/components/ui/TimeInput";

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

  const setShortcut = (daysBackStart: number, daysBackEnd: number = 0) => {
    const today = new Date();
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - daysBackStart);
    const startY = startDate.getFullYear();
    const startM = String(startDate.getMonth() + 1).padStart(2, "0");
    const startD = String(startDate.getDate()).padStart(2, "0");

    const endDate = new Date(today);
    endDate.setDate(today.getDate() - daysBackEnd);
    const endY = endDate.getFullYear();
    const endM = String(endDate.getMonth() + 1).padStart(2, "0");
    const endD = String(endDate.getDate()).padStart(2, "0");

    onDateFromChange(`${startY}-${startM}-${startD}T00:00`);
    onDateToChange(`${endY}-${endM}-${endD}T23:59`);
  };

  const handleDateTimeChange = (type: "from" | "to", datePart: string, timePart: string) => {
    if (!datePart) {
      if (type === "from") onDateFromChange("");
      else onDateToChange("");
      return;
    }
    const val = `${datePart}T${timePart || "00:00"}`;
    if (type === "from") onDateFromChange(val);
    else onDateToChange(val);
  };

  const fromDate = dateFrom ? dateFrom.split("T")[0] : "";
  const fromTime =
    dateFrom && dateFrom.includes("T")
      ? dateFrom.split("T")[1].slice(0, 5)
      : "00:00";

  const toDate = dateTo ? dateTo.split("T")[0] : "";
  const toTime =
    dateTo && dateTo.includes("T") ? dateTo.split("T")[1].slice(0, 5) : "23:59";

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
        <div className="absolute top-full mt-2 right-0 w-[90vw] sm:w-[380px] max-w-[380px] bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Filtriraj po datumu</h3>
            {hasValue && (
              <button
                onClick={() => {
                  onDateFromChange("");
                  onDateToChange("");
                }}
                className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-md"
              >
                Očisti sve
              </button>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">
              Polje za filtriranje
            </label>
            <select
              value={dateField}
              onChange={(e) => onDateFieldChange(e.target.value as "published_at" | "created_at")}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-gray-50/50"
            >
              <option value="published_at">Datum objave (na sajtu)</option>
              <option value="created_at">Datum skeniranja</option>
            </select>
          </div>

          <div className="mb-5">
            <label className="block text-xs text-gray-500 mb-2 font-medium">
              Brzi odabir
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShortcut(0)}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-md transition-colors"
              >
                Danas
              </button>
              <button
                onClick={() => setShortcut(1, 1)}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
              >
                Jučer
              </button>
              <button
                onClick={() => setShortcut(7, 0)}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
              >
                Zadnjih 7
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* OD */}
            <div className="p-3 bg-gray-50/50 border border-gray-100 rounded-lg">
              <label className="block text-xs text-emerald-600 mb-2 font-semibold uppercase tracking-wider">
                Početak (Od)
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => handleDateTimeChange("from", e.target.value, fromTime)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                />
                <TimeInput
                  value={fromTime}
                  onChange={(time) => handleDateTimeChange("from", fromDate, time)}
                  accent="emerald"
                />
              </div>
            </div>

            {/* DO */}
            <div className="p-3 bg-gray-50/50 border border-gray-100 rounded-lg">
              <label className="block text-xs text-rose-600 mb-2 font-semibold uppercase tracking-wider">
                Kraj (Do)
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => handleDateTimeChange("to", e.target.value, toTime)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                />
                <TimeInput
                  value={toTime}
                  onChange={(time) => handleDateTimeChange("to", toDate, time)}
                  accent="rose"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
