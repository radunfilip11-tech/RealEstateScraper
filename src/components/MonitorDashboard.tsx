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
  latency: { avgMs: number; minMs: number; maxMs: number };
  ads: { total24h: number };
  cycles: { total24h: number; avgDurationS: number; avgTimeBetweenScansMs: number; avgCategoryScanGapMs: number; categoryGapsMs: Record<string, number> };
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "--";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function MonitorDashboard() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [workerCount, setWorkerCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [showCatDetails, setShowCatDetails] = useState(false);
  
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
    await fetch("/api/monitor/control", { method: "POST", body: JSON.stringify({ action: "start", workers: 3 }) });
    setTimeout(checkStatus, 2000);
    setIsProcessing(false);
  };

  const handleStop = async () => {
    setIsProcessing(true);
    await fetch("/api/monitor/control", { method: "POST", body: JSON.stringify({ action: "stop" }) });
    setTimeout(checkStatus, 2000);
    setIsProcessing(false);
  };

  const handleClearDb = async () => {
    if (!confirm("Are you sure you want to clear ALL listings and logs?")) return;
    setIsProcessing(true);
    await fetch("/api/monitor/control", { method: "POST", body: JSON.stringify({ action: "clear_db" }) });
    setLogs([]);
    setListings([]);
    setStats(null);
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
              Start Scraper (3 Workers)
            </button>
          )}
          
          <button
            onClick={handleClearDb}
            disabled={isRunning || isProcessing}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Clear Database
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Prosječno kašnjenje</div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatDuration(stats?.latency?.avgMs || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">od objave do naše baze</div>
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
            <div className="mt-2 space-y-1 max-h-16 overflow-y-auto pr-1 custom-scrollbar">
              {stats?.cycles?.categoryGapsMs ? (
                Object.entries(stats.cycles.categoryGapsMs).map(([cat, gapMs]) => (
                  <div key={cat} className="flex justify-between text-xs border-b border-slate-700/50 pb-0.5">
                    <span className="text-slate-300 capitalize">{cat.replace(/_/g, " ")}</span>
                    <span className="text-blue-300 font-mono">{formatDuration(gapMs)}</span>
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
        <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Oglasi (24h)</div>
          <div className="text-2xl font-bold text-white">
            {stats?.ads?.total24h || 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">ukupno spremljeno</div>
        </div>
        <div className="bg-[#0f172a] text-white p-4 rounded-xl shadow-sm border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Najbrže / Najsporije</div>
          <div className="text-lg font-bold text-slate-200">
            {formatDuration(stats?.latency?.minMs || 0)} <span className="text-slate-500 font-normal">/</span> {formatDuration(stats?.latency?.maxMs || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">min i max latencija</div>
        </div>
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
                Workers: W1, W2, W3
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
