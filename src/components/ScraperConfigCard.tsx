"use client";

import { useState, useEffect } from "react";
import { DEFAULT_SCRAPER_CONFIG, type ScraperConfig } from "@/lib/supabase/types";

export default function ScraperConfigCard() {
  const [config, setConfig] = useState<ScraperConfig>(DEFAULT_SCRAPER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/scraper-config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error("Failed to fetch scraper config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatusMsg(null);

      const res = await fetch("/api/scraper-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setStatusMsg({ type: "success", text: "Postavke uspješno spremljene! Radnici će ih primijeniti u sljedećem ciklusu." });
      } else {
        const err = await res.json();
        setStatusMsg({ type: "error", text: err.error || "Greška pri spremanju postavki." });
      }
    } catch (err) {
      setStatusMsg({ type: "error", text: "Greška u mrežnoj komunikaciji." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg animate-pulse">
        <div className="h-6 w-48 bg-slate-800 rounded mb-4"></div>
        <div className="h-20 bg-slate-800/50 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg text-slate-100">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            ⚙️ Postavke Rasporeda i Skeniranja (Daljinsko upravljanje)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Promjene se automatski primjenjuju na VPS radnike u sljedećem ciklusu bez potrebe za ponovnim pokretanjem.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Radnici omogućen:</span>
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, workers_enabled: !prev.workers_enabled }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              config.workers_enabled ? "bg-emerald-600" : "bg-slate-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                config.workers_enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
            statusMsg.type === "success"
              ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
              : "bg-red-950/60 border border-red-800 text-red-300"
          }`}
        >
          <span>{statusMsg.text}</span>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Worker 1 Interval */}
        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Worker 1 Period (Minute)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="1440"
              value={config.w1_interval_min}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, w1_interval_min: Math.max(1, parseInt(e.target.value) || 30) }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-semibold text-amber-400 focus:outline-none focus:border-amber-500"
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">min</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Sprint kategorije (stanovi, kuće, najam...)</p>
        </div>

        {/* Worker 2 Interval */}
        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Worker 2 Period (Minute)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="15"
              max="1440"
              value={config.w2_interval_min}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, w2_interval_min: Math.max(1, parseInt(e.target.value) || 300) }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-semibold text-blue-400 focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">
              ({Math.round((config.w2_interval_min / 60) * 10) / 10}h)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Sve ostale kategorije</p>
        </div>

        {/* Night Window */}
        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Noćna Pauza (Sati)
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              max="23"
              value={config.night_start_hour}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, night_start_hour: parseInt(e.target.value) || 0 }))
              }
              className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-center font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-400">do</span>
            <input
              type="number"
              min="0"
              max="23"
              value={config.night_end_hour}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, night_end_hour: parseInt(e.target.value) || 6 }))
              }
              className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-center font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-500">h</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Automatsko spavanje radnika</p>
        </div>

        {/* Max Pages */}
        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Maks. Stranica po Skeniranju
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="50"
              value={config.max_pages_per_category}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, max_pages_per_category: Math.max(1, parseInt(e.target.value) || 10) }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-semibold text-purple-400 focus:outline-none focus:border-purple-500"
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">stranica</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Zaštitni limit inkrementalnog skeniranja</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-5 py-2 rounded-lg transition-colors shadow flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Spremanje...
            </>
          ) : (
            "💾 Spremi Postavke Rasporeda"
          )}
        </button>
      </div>
    </div>
  );
}
