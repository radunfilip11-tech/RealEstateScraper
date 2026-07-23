"use client";

import { useState } from "react";
import type { NotificationFilter } from "@/lib/supabase/types";

interface NotificationFilterCardProps {
  filter: NotificationFilter;
  onEdit: () => void;
  onDeleted: () => void;
  onToggled: () => void;
}

type Badge = { label: string; color: string };

function buildBadges(filter: NotificationFilter): Badge[] {
  const badges: Badge[] = [];
  const push = (values: string[], color: string) => {
    values.forEach((v) => badges.push({ label: v, color }));
  };

  push(filter.property_types, "bg-blue-100 text-blue-800");
  push(filter.transaction_types, "bg-indigo-100 text-indigo-800");
  push(filter.location_counties, "bg-emerald-100 text-emerald-800");
  push(filter.location_cities, "bg-emerald-50 text-emerald-700");
  push(filter.location_neighborhoods, "bg-teal-50 text-teal-700");
  push(filter.advertiser_types, "bg-purple-100 text-purple-800");
  push(filter.sources, "bg-gray-100 text-gray-700");
  push(filter.statuses, "bg-amber-100 text-amber-800");

  push(filter.land_types, "bg-emerald-50 text-emerald-700");
  push(filter.house_types, "bg-amber-50 text-amber-700");
  push(filter.commercial_types, "bg-blue-50 text-blue-700");

  if (filter.price_min !== null || filter.price_max !== null) {
    badges.push({
      label: `${filter.price_min?.toLocaleString("hr-HR") ?? "0"} - ${filter.price_max?.toLocaleString("hr-HR") ?? "∞"} €`,
      color: "bg-green-100 text-green-800",
    });
  }
  if (filter.size_min !== null || filter.size_max !== null) {
    badges.push({
      label: `${filter.size_min ?? "0"} - ${filter.size_max ?? "∞"} m²`,
      color: "bg-orange-100 text-orange-800",
    });
  }
  if (filter.yard_size_min !== null || filter.yard_size_max !== null) {
    badges.push({
      label: `Okućnica: ${filter.yard_size_min ?? "0"} - ${filter.yard_size_max ?? "∞"} m²`,
      color: "bg-orange-50 text-orange-800",
    });
  }
  if (filter.room_count_min !== null || filter.room_count_max !== null) {
    badges.push({
      label: `Sobe: ${filter.room_count_min ?? "0"} - ${filter.room_count_max ?? "∞"}`,
      color: "bg-gray-100 text-gray-800",
    });
  }

  return badges;
}

export default function NotificationFilterCard({
  filter,
  onEdit,
  onDeleted,
  onToggled,
}: NotificationFilterCardProps) {
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const badges = buildBadges(filter);

  async function handleToggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/notification-filters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: filter.id,
          is_active: !filter.is_active,
        }),
      });
      if (res.ok) onToggled();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Obrisati pravilo "${filter.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/notification-filters?id=${encodeURIComponent(filter.id)}`,
        { method: "DELETE" },
      );
      if (res.ok) onDeleted();
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/notify/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter_id: filter.id, dry_run: false }),
      });
      const data = await res.json();
      if (res.ok) {
        const result = data.results?.[0];
        if (result?.sent) {
          setTestResult(
            `Poslano ${data.matches} podudaranja na Telegram`,
          );
        } else if (data.matches === 0) {
          setTestResult("Nema novih podudaranja");
        } else {
          setTestResult(
            `Greška: ${result?.error || "Telegram slanje nije uspjelo"}`,
          );
        }
      } else {
        setTestResult(`Greška: ${data.error}`);
      }
    } catch (err) {
      setTestResult(`Greška: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  }

  return (
    <div
      className={`bg-white border rounded-xl p-5 transition-all ${
        filter.is_active ? "border-gray-200" : "border-gray-200 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {filter.name}
            </h3>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                filter.is_active
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {filter.is_active ? "Aktivno" : "Pauzirano"}
            </span>
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
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
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
            {filter.telegram_chat_id}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleToggle}
            disabled={busy}
            title={filter.is_active ? "Pauziraj" : "Aktiviraj"}
            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {filter.is_active ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </button>
          <button
            onClick={handleTest}
            disabled={busy || !filter.is_active}
            title="Pošalji testnu obavijest sada"
            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
          <button
            onClick={onEdit}
            disabled={busy}
            title="Uredi"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            title="Obriši"
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a2 2 0 012-2h4a2 2 0 012 2v3"
              />
            </svg>
          </button>
        </div>
      </div>

      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge, idx) => (
            <span
              key={idx}
              className={`text-xs font-medium px-2 py-0.5 rounded ${badge.color}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">
          Nema postavljenih kriterija — obavještava o svim novim oglasima
        </p>
      )}

      {testResult && (
        <div className="mt-3 text-xs px-3 py-2 rounded-lg bg-gray-50 text-gray-700 border border-gray-200">
          {testResult}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
        <span>
          Zadnja obavijest:{" "}
          {filter.last_notified_at
            ? new Date(filter.last_notified_at).toLocaleString("hr-HR")
            : "nikada"}
        </span>
        <span>
          Kreirano: {new Date(filter.created_at).toLocaleDateString("hr-HR")}
        </span>
      </div>
    </div>
  );
}
