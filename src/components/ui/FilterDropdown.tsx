"use client";

import { useRef, useState, useEffect } from "react";

interface FilterDropdownProps {
  id?: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  icon?: React.ReactNode;
}

export default function FilterDropdown({
  id,
  label,
  options,
  selected,
  onChange,
  icon,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const clearAll = () => onChange([]);

  const displayText =
    selected.length === 0
      ? label
      : selected.length === 1
        ? selected[0]
        : `${selected.length} odabrano`;

  return (
    <div ref={ref} className="relative" id={`filter-${id || label.toLowerCase().replace(/\s+/g, "-")}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
          selected.length > 0
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {icon && <span className="flex-shrink-0 text-gray-400 group-hover:text-gray-500">{icon}</span>}
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
        <div className="absolute top-full left-0 mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="w-full px-4 py-1.5 text-left text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Očisti sve
            </button>
          )}
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggleOption(option)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/20 transition-colors"
              />
              <span className="text-sm text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
