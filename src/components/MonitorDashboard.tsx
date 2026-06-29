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

export default function MonitorDashboard() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const supabase = getSupabaseBrowserClient();

  // Fetch initial status and data
  useEffect(() => {
    checkStatus();
    
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

  // Polling for status just to be safe
  useEffect(() => {
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/monitor/control", {
        method: "POST",
        body: JSON.stringify({ action: "status" })
      });
      const data = await res.json();
      setIsRunning(data.isRunning);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStart = async () => {
    setIsProcessing(true);
    await fetch("/api/monitor/control", { method: "POST", body: JSON.stringify({ action: "start" }) });
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
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Status:</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isRunning ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {isRunning ? "Running" : "Stopped"}
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
              Start Scraper
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

      {/* Split Screen */}
      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* Left Pane: Live Listings */}
        <div className="w-1/2 flex flex-col bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-white border-b border-gray-200 font-medium text-sm text-gray-700 flex items-center justify-between">
            <span>Live Private Ads</span>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{listings.length} recently found</span>
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
          <div className="px-4 py-3 bg-[#161b22] border-b border-gray-800 font-medium text-sm text-gray-300 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Terminal Output
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
