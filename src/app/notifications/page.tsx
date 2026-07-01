"use client";

import { useState, useEffect, useCallback } from "react";
import type { NotificationFilter } from "@/lib/supabase/types";
import NotificationFilterForm from "@/components/notifications/NotificationFilterForm";
import NotificationFilterCard from "@/components/notifications/NotificationFilterCard";

export default function NotificationsPage() {
  const [filters, setFilters] = useState<NotificationFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NotificationFilter | null>(null);

  const fetchFilters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notification-filters");
      const data = await res.json();
      if (res.ok) {
        setFilters(data.filters || []);
      }
    } catch (err) {
      console.error("Failed to fetch notification filters:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  function handleAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(filter: NotificationFilter) {
    setEditing(filter);
    setShowForm(true);
  }

  function handleClose(refresh?: boolean) {
    setShowForm(false);
    setEditing(null);
    if (refresh) fetchFilters();
  }

  const activeCount = filters.filter((f) => f.is_active).length;

  return (
    <div className="flex-1 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Obavijesti</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filters.length} pravila · {activeCount} aktivnih
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-all duration-150 shadow-sm hover:shadow"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Novo pravilo
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
        <svg
          className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="text-sm text-emerald-800">
          <p className="font-medium mb-1">Kako to radi</p>
          <p className="text-emerald-700 text-xs leading-relaxed">
            Definirajte filtere za koje želite primati WhatsApp obavijesti.
            Svako pravilo ima svoj broj telefona i skup filtera. Kada
            monitor pronađe novi oglas koji odgovara filterima, dobit
            ćete WhatsApp obavijest.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <svg
            className="animate-spin w-8 h-8 text-emerald-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-gray-500">Učitavanje pravila...</p>
        </div>
      ) : filters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Još nemate pravila
          </h3>
          <p className="text-xs text-gray-500 max-w-[300px] mb-4">
            Kreirajte prvo pravilo za obavijesti kako biste dobili WhatsApp
            poruke o novim oglasima koji odgovaraju vašim kriterijima.
          </p>
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Novo pravilo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filters.map((filter) => (
            <NotificationFilterCard
              key={filter.id}
              filter={filter}
              onEdit={() => handleEdit(filter)}
              onDeleted={fetchFilters}
              onToggled={fetchFilters}
            />
          ))}
        </div>
      )}

      {showForm && (
        <NotificationFilterForm existing={editing} onClose={handleClose} />
      )}
    </div>
  );
}
