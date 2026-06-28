"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Buyer } from "@/lib/supabase/types";
import BuyerFormModal from "@/components/buyers/BuyerFormModal";

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchBuyers();
  }, []);

  async function fetchBuyers() {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("buyers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching buyers:", error);
    } else {
      setBuyers(data || []);
    }
    setLoading(false);
  }

  function handleAddBuyer() {
    setIsModalOpen(true);
  }

  function handleModalClose(refresh = false) {
    setIsModalOpen(false);
    if (refresh) {
      fetchBuyers();
    }
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Kupci</h1>
          <p className="text-sm text-gray-500 mt-1">{buyers.length} rezultata</p>
        </div>
        <button
          onClick={handleAddBuyer}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          + Dodaj kupca
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-300">
              <tr>
                <th className="px-6 py-4 font-semibold">Kupac</th>
                <th className="px-6 py-4 font-semibold">Kontakt</th>
                <th className="px-6 py-4 font-semibold">Kriteriji za kupnju</th>
                <th className="px-6 py-4 font-semibold text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : buyers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Nema dodanih kupaca.
                  </td>
                </tr>
              ) : (
                buyers.map((buyer) => (
                  <tr
                    key={buyer.id}
                    className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {buyer.name}
                    </td>
                    <td className="px-6 py-4">
                      {buyer.contact || "-"}
                    </td>
                    <td className="px-6 py-4">
                      {buyer.criteria ? (
                        <div className="flex flex-wrap gap-2">
                          {buyer.criteria.property_type && (
                            <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                              {buyer.criteria.property_type}
                            </span>
                          )}
                          {buyer.criteria.location_county && (
                            <span className="bg-gray-100 text-gray-800 text-xs px-2.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-300">
                              {buyer.criteria.location_county}
                            </span>
                          )}
                          {(buyer.criteria.price_min || buyer.criteria.price_max) && (
                            <span className="bg-green-100 text-green-800 text-xs px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">
                              {buyer.criteria.price_min || 0} - {buyer.criteria.price_max || "∞"} €
                            </span>
                          )}
                          {(buyer.criteria.size_m2_min || buyer.criteria.size_m2_max) && (
                            <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-0.5 rounded dark:bg-purple-900 dark:text-purple-300">
                              {buyer.criteria.size_m2_min || 0} - {buyer.criteria.size_m2_max || "∞"} m²
                            </span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {/* Placeholder for future edit/delete actions */}
                      <button className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <BuyerFormModal onClose={handleModalClose} />}
    </div>
  );
}
