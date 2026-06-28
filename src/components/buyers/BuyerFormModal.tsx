"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BuyerInsert } from "@/lib/supabase/types";

interface BuyerFormModalProps {
  onClose: (refresh?: boolean) => void;
}

export default function BuyerFormModal({ onClose }: BuyerFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    property_type: "Stan",
    location_county: "",
    price_min: "",
    price_max: "",
    size_m2_min: "",
    size_m2_max: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const criteria = {
      property_type: formData.property_type || null,
      location_county: formData.location_county || null,
      price_min: formData.price_min ? Number(formData.price_min) : null,
      price_max: formData.price_max ? Number(formData.price_max) : null,
      size_m2_min: formData.size_m2_min ? Number(formData.size_m2_min) : null,
      size_m2_max: formData.size_m2_max ? Number(formData.size_m2_max) : null,
    };

    const newBuyer: BuyerInsert = {
      name: formData.name,
      contact: formData.contact || null,
      criteria: criteria,
    };

    const supabase = getSupabaseBrowserClient() as any;
    const { error: insertError } = await supabase.from("buyers").insert([newBuyer]);

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
    } else {
      onClose(true); // Close and refresh list
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Novi kupac</h2>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ime i prezime / Naziv
              </label>
              <input
                required
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Kontakt (Broj za WhatsApp)
              </label>
              <input
                type="text"
                name="contact"
                placeholder="+385912345678"
                value={formData.contact}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div className="col-span-2 pt-2 pb-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b dark:border-gray-700 pb-1">
                Kriteriji za kupnju
              </h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tip nekretnine
              </label>
              <select
                name="property_type"
                value={formData.property_type}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="Stan">Stan</option>
                <option value="Kuća">Kuća</option>
                <option value="Zemljište">Zemljište</option>
                <option value="Poslovni prostor">Poslovni prostor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Županija / Regija
              </label>
              <input
                type="text"
                name="location_county"
                placeholder="npr. Grad Zagreb"
                value={formData.location_county}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cijena od (€)
              </label>
              <input
                type="number"
                name="price_min"
                value={formData.price_min}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cijena do (€)
              </label>
              <input
                type="number"
                name="price_max"
                value={formData.price_max}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Kvadratura od (m²)
              </label>
              <input
                type="number"
                name="size_m2_min"
                value={formData.size_m2_min}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Kvadratura do (m²)
              </label>
              <input
                type="number"
                name="size_m2_max"
                value={formData.size_m2_max}
                onChange={handleChange}
                className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none disabled:opacity-50"
            >
              {loading ? "Spremanje..." : "Spremi kupca"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
