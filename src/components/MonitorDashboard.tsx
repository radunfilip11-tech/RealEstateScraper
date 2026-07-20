"use client";

import { useState, useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Listing } from "@/lib/supabase/types";
import ListingCard from "@/components/ui/ListingCard";

interface LogEntry {
  id: string;
  created_at: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
}

interface StatsData {
  proxy?: { mb24h: number; projectedGbPerMonth: number };
  latency: {
    avgMs: number;
    minMs: number;
    maxMs: number;
    recent: { id: string; title: string; latencyMs: number; createdAt: string }[];
  };
  ads: { total24h: number; adsPerHour?: number[] };
  cycles: {
    total24h: number;
    avgDurationS: number;
    avgTimeBetweenScansMs: number;
    avgCategoryScanGapMs: number;
    categoryGapsMs: Record<string, number>;
    categoryDetails: Record<
      string,
      {
        avgGapMs: number;
        lastGapMs: number | null;
        lastScannedAt: string | null;
        recentGapsMs: number[];
      }
    >;
  };
  workers: Record<
    number,
    {
      lastCycleDurationS: number | null;
      lastCycleStartedAt: string | null;
      lastCycleEndedAt: string | null;
      secondsSinceCycleEnd: number | null;
      secondsSinceCategoryScan: number | null;
      lastCategory: string | null;
      lastCategoryScanAt: string | null;
      avgCycleDurationS: number;
      recentCycles: { durationS: number; startedAt: string; newListings: number }[];
      recentCategoryGapsMs: number[];
      status: "scanning" | "resting" | "idle";
    }
  >;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "--";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function workerStatusLabel(status: "scanning" | "resting" | "idle"): string {
  if (status === "scanning") return "Skenira";
  if (status === "resting") return "Čeka";
  return "Neaktivan";
}

function workerStatusColor(status: "scanning" | "resting" | "idle"): string {
  if (status === "scanning") return "text-emerald-400 bg-emerald-400/10";
  if (status === "resting") return "text-amber-400 bg-amber-400/10";
  return "text-slate-400 bg-slate-400/10";
}

export default function MonitorDashboard() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [workerCount, setWorkerCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [showCatDetails, setShowCatDetails] = useState(false);
  const [showLatencyDetails, setShowLatencyDetails] = useState(false);
  const [showAdsDetails, setShowAdsDetails] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const supabase = getSupabaseBrowserClient();

  // Fetch initial status and data
  useEffect(() => {
    checkStatus();
    fetchStats();
    
    // Fetch last 50 logs
    supabase.from("scraper_console_logs").select("*").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setLogs(data.reverse()); });
      
    // Fetch last 20 private listings
    supabase.from("listings").select("*").eq("advertiser_type", "Privatni").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setListings(data); });
  }, []);

  // Set up Realtime subscriptions
  useEffect(() => {
    const channel = supabase.channel("live_monitor")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scraper_console_logs" },
        (payload) => {
          setLogs((current) => [...current, payload.new as LogEntry].slice(-200)); // Keep last 200 logs
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "listings" },
        (payload) => {
          setListings((current) => {
            const newListing = payload.new as Listing;
            // Prevent duplicate keys if we receive an event for something we already have
            if (current.some(l => l.id === newListing.id)) return current;
            return [newListing, ...current].slice(0, 50);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Polling for status & stats
  useEffect(() => {
    const statusInterval = setInterval(checkStatus, 5000);
    const statsInterval = setInterval(fetchStats, 30000); // Fetch stats every 30s
    return () => {
      clearInterval(statusInterval);
      clearInterval(statsInterval);
    };
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch("/api/monitor/control", {
        method: "POST",
        body: JSON.stringify({ action: "status" })
      });
      const data = await res.json();
      setIsRunning(data.isRunning);
      setWorkerCount(data.workerCount || 0);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/monitor/stats");
      const data = await res.json();
      if (!data.error) setStats(data);
    } catch (e) {
      console.error(e);
    }
  }

  const handleStart = async () => {
    setIsProcessing(true);
    await fetch("/api/monitor/control", { method: "POST", body: JSON.stringify({ action: "start", workers: 2 }) });
    setTimeout(checkStatus, 2000);
    setIsProcessing(false);
  };

  const handleStop = async () => {
    setIsProcessing(true);
    await fetch("/api/monitor/control", { method: "POST", body: JSON.stringify({ action: "stop" }) });
    setTimeout(checkStatus, 2000);
    setIsProcessing(false);
  };



  const getLogColor = (level: string) => {
    switch (level) {
      case "error": return "text-red-400";
      case "warning": return "text-yellow-400";
      case "success": return "text-green-400";
      default: return "text-gray-300";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Status:</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isRunning ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {isRunning ? `Running (${workerCount} workers)` : "Stopped"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={isProcessing}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              Stop Scraper
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={isProcessing}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Start Scraper (2 Workers)
            </button>
          )}
          

        </div>
      </div>

      {/* Stats Panel */}
      <div className="grid grid-cols-6 gap-4 mb-4">
        <div
          className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
          onClick={() => setShowLatencyDetails(!showLatencyDetails)}
        >
          <div className="flex items-center justify-between">
            <div className="text-slate-400 text-xs font-medium mb-1">Prosječno kašnjenje</div>
            <span className="text-[10px] text-slate-500">{showLatencyDetails ? "Prikaži manje" : "Detalji"}</span>
          </div>
          {!showLatencyDetails ? (
            <>
              <div className="text-2xl font-bold text-emerald-400">
                {formatDuration(stats?.latency?.avgMs || 0)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">od objave do naše baze</div>
            </>
          ) : (
            <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
              {stats?.latency?.recent?.length ? (
                stats.latency.recent.map((item) => (
                  <div key={item.id} className="flex justify-between gap-2 text-xs border-b border-slate-700/50 pb-0.5">
                    <span className="text-slate-300 truncate flex-1" title={item.title}>
                      {item.title.substring(0, 28)}{item.title.length > 28 ? "…" : ""}
                    </span>
                    <span className="text-emerald-300 font-mono shrink-0">{formatDuration(item.latencyMs)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">Nema podataka (zadnjih 15)</div>
              )}
            </div>
          )}
        </div>
        <div 
          className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors relative"
          onClick={() => setShowCatDetails(!showCatDetails)}
        >
          <div className="flex items-center justify-between">
            <div className="text-slate-400 text-xs font-medium mb-1">Frekvencija kategorije</div>
            <span className="text-[10px] text-slate-500">{showCatDetails ? "Prikaži manje" : "Detalji"}</span>
          </div>
          {!showCatDetails ? (
            <>
              <div className="text-2xl font-bold text-blue-400">
                {formatDuration(stats?.cycles?.avgCategoryScanGapMs || 0)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">prosjek za sve</div>
            </>
          ) : (
            <div className="mt-2 space-y-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
              {stats?.cycles?.categoryDetails ? (
                Object.entries(stats.cycles.categoryDetails).map(([cat, detail]) => (
                  <div key={cat} className="text-xs border-b border-slate-700/50 pb-1">
                    <div className="flex justify-between">
                      <span className="text-slate-300 capitalize">{cat.replace(/_/g, " ")}</span>
                      <span className="text-blue-300 font-mono">{formatDuration(detail.avgGapMs)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                      <span>Zadnji: {formatTime(detail.lastScannedAt)}</span>
                      <span>
                        {detail.lastGapMs ? formatDuration(detail.lastGapMs) : "--"}
                        {detail.recentGapsMs.length > 0 && (
                          <span className="text-slate-600 ml-1">
                            [{detail.recentGapsMs.map((g) => `${Math.round(g / 1000)}s`).join(", ")}]
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">Nema podataka</div>
              )}
            </div>
          )}
        </div>
        <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Ciklus svih kategorija</div>
          <div className="text-2xl font-bold text-indigo-400">
            {formatDuration(stats?.cycles?.avgTimeBetweenScansMs || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">svaki put kad prođemo sve</div>
        </div>
        <div 
          className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
          onClick={() => setShowAdsDetails(!showAdsDetails)}
        >
          <div className="flex items-center justify-between">
            <div className="text-slate-400 text-xs font-medium mb-1">Oglasi (24h)</div>
            <span className="text-[10px] text-slate-500">{showAdsDetails ? "Prikaži manje" : "Po satu"}</span>
          </div>
          {!showAdsDetails ? (
            <>
              <div className="text-2xl font-bold text-white">
                {stats?.ads?.total24h || 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">ukupno spremljeno</div>
            </>
          ) : (
            <div className="mt-2 h-28 flex items-end justify-between gap-0.5 pt-4 border-b border-slate-700/50 pb-1">
              {stats?.ads?.adsPerHour ? (
                (() => {
                  const maxAds = Math.max(...stats.ads.adsPerHour, 1);
                  return stats.ads.adsPerHour.map((count, i) => {
                    const heightPercent = (count / maxAds) * 100;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 group relative">
                        <div 
                          className="w-full bg-blue-500 rounded-t-sm transition-all hover:bg-blue-400" 
                          style={{ height: `${Math.max(heightPercent, count > 0 ? 4 : 0)}%` }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-xs px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 border border-slate-600">
                          {i}:00 - {count} ogl.
                        </div>
                        {i % 4 === 0 && (
                          <div className="text-[8px] text-slate-500 mt-0.5">{i}</div>
                        )}
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="text-xs text-slate-500 w-full text-center pb-4">Nema podataka</div>
              )}
            </div>
          )}
        </div>
        <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Najbrže / Najsporije</div>
          <div className="text-lg font-bold text-slate-200">
            {formatDuration(stats?.latency?.minMs || 0)} <span className="text-slate-500 font-normal">/</span> {formatDuration(stats?.latency?.maxMs || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">min i max latencija</div>
        </div>
        <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Proxy potrošnja</div>
          <div className="text-2xl font-bold text-cyan-400">
            {Math.round(stats?.proxy?.mb24h || 0)} MB
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            ≈ {(stats?.proxy?.projectedGbPerMonth || 0).toFixed(1)} GB / mjesec (procjena)
          </div>
        </div>
      </div>

      {/* Worker Stats Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[1, 2].map((workerId) => {
          const w = stats?.workers?.[workerId];
          return (
            <div key={workerId} className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-slate-400 text-xs font-medium">Worker {workerId}</div>
                {w && (
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${workerStatusColor(w.status)}`}>
                    {workerStatusLabel(w.status)}
                    {w.lastCategory && w.status === "scanning" ? ` · ${w.lastCategory.replace(/_/g, " ")}` : ""}
                  </span>
                )}
              </div>
              {!w ? (
                <div className="text-xs text-slate-500">Nema podataka</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <div>
                      <div className="text-[10px] text-slate-500">Zadnji ciklus</div>
                      <div className="text-sm font-bold text-indigo-300">
                        {w.lastCycleDurationS != null ? `${w.lastCycleDurationS}s` : "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Prosjek (10)</div>
                      <div className="text-sm font-bold text-indigo-300">
                        {w.avgCycleDurationS > 0 ? `${w.avgCycleDurationS}s` : "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Od zadnjeg skena</div>
                      <div className="text-sm font-bold text-amber-300">
                        {w.secondsSinceCategoryScan != null ? `${w.secondsSinceCategoryScan}s` : "--"}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mb-1">
                    Zadnji ciklus: {formatTime(w.lastCycleEndedAt)} · Kategorija: {formatTime(w.lastCategoryScanAt)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {w.recentCycles.slice(0, 10).map((c, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
                        title={`${formatTime(c.startedAt)} · ${c.newListings} novih`}
                      >
                        {c.durationS}s
                      </span>
                    ))}
                  </div>
                  {w.recentCategoryGapsMs.length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1.5">
                      Pauze između kategorija:{" "}
                      <span className="text-slate-400 font-mono">
                        {w.recentCategoryGapsMs.map((g) => `${Math.round(g / 1000)}s`).join(" · ")}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Split Screen */}
      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* Left Pane: Live Listings */}
        <div className="w-1/2 flex flex-col bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-white border-b border-gray-200 font-medium text-sm text-gray-700 flex items-center justify-between">
            <span>Live Private Ads</span>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{listings.length} nedavno</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {listings.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No private ads found yet...
              </div>
            ) : (
              listings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))
            )}
          </div>
        </div>

        {/* Right Pane: Live Console */}
        <div className="w-1/2 flex flex-col bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden shadow-lg">
          <div className="px-4 py-3 bg-[#161b22] border-b border-gray-800 font-medium text-sm text-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Terminal Output
            </div>
            {workerCount > 0 && (
              <div className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                Workers: W1, W2
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-gray-500">Waiting for logs...</div>
            ) : (
              logs.map((log, i) => (
                <div key={log.id || i} className={`mb-1 break-words ${getLogColor(log.level)}`}>
                  <span className="text-gray-600 mr-2 text-[10px]">
                    {new Date(log.created_at).toLocaleTimeString('hr-HR')}
                  </span>
                  {log.message}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}
