"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [phone, setPhone] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestNotification = async () => {
    if (!phone) {
      setTestResult("❌ Unesite broj telefona");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone }),
      });
      const data = await res.json();

      if (res.ok) {
        setTestResult(
          `✅ ${data.message || "Obavijest poslana!"} (${data.count || 0} oglasa)`
        );
      } else {
        setTestResult(
          `❌ ${data.error || "Greška pri slanju obavijesti"}`
        );
      }
    } catch (err) {
      setTestResult(`❌ Greška: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900">Postavke</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Konfiguracija obavijesti i postavki scrapera
        </p>
      </div>

      {/* WhatsApp Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-green-600"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              WhatsApp obavijesti
            </h3>
            <p className="text-xs text-gray-500">
              Primajte obavijesti o novim oglasima putem WhatsAppa
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="phone-number"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Broj telefona
            </label>
            <input
              type="tel"
              id="phone-number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+385 91 234 5678"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Unesite broj u internacionalnom formatu (npr. +385...)
            </p>
          </div>

          <button
            id="test-notification-button"
            onClick={handleTestNotification}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
          >
            {testing ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
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
                Slanje...
              </>
            ) : (
              "Pošalji testnu obavijest"
            )}
          </button>

          {testResult && (
            <div
              id="test-result"
              className={`px-4 py-3 rounded-lg text-sm font-medium ${
                testResult.startsWith("✅")
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {testResult}
            </div>
          )}
        </div>
      </div>

      {/* Scraper Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Postavke scrapera
            </h3>
            <p className="text-xs text-gray-500">
              Konfiguracija automatskog prikupljanja oglasa
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Izvor</p>
              <p className="text-xs text-gray-400">
                Aktivni izvori za prikupljanje
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-md">
                Njuškalo
              </span>
              <span className="px-2.5 py-1 bg-gray-50 border border-gray-200 text-gray-400 text-xs font-medium rounded-md">
                Index (uskoro)
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Kategorije
              </p>
              <p className="text-xs text-gray-400">
                Tipovi nekretnina za praćenje
              </p>
            </div>
            <span className="text-sm text-gray-600">Stanovi, Kuće</span>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Maks. stranica po izvoru
              </p>
              <p className="text-xs text-gray-400">
                Koliko stranica rezultata se skrapira
              </p>
            </div>
            <span className="text-sm text-gray-600 font-medium italic">Podesivo na ploči</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-amber-800">
              Twilio konfiguracija
            </h4>
            <p className="text-xs text-amber-700 mt-1">
              Za WhatsApp obavijesti potreban je Twilio račun. Dodajte
              <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[11px] font-mono">
                TWILIO_ACCOUNT_SID
              </code>
              ,
              <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[11px] font-mono">
                TWILIO_AUTH_TOKEN
              </code>
              i
              <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[11px] font-mono">
                TWILIO_WHATSAPP_FROM
              </code>
              u <strong>.env.local</strong> datoteku.
            </p>
          </div>
        </div>
      </div>

      {/* Test Section */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-5 mt-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Testiranje WhatsApp Obavijesti</h3>
        <p className="text-sm text-gray-500 mb-4">
          Unesite svoj broj u formatu <strong>whatsapp:+3859...</strong> i pošaljite testnu obavijest za nove oglase koji odgovaraju kriterijima kupaca u bazi.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            id="testPhone"
            placeholder="whatsapp:+3859..."
            className="flex-1 max-w-sm text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={async () => {
              const phoneInput = document.getElementById('testPhone') as HTMLInputElement;
              if (!phoneInput?.value) return alert('Unesite broj mobitela');
              try {
                const res = await fetch('/api/notify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phone_number: phoneInput.value })
                });
                if (res.ok) alert('Test uspješan! Provjerite WhatsApp.');
                else alert('Greška: ' + await res.text());
              } catch (e) {
                alert('Greška pri slanju.');
              }
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Pošalji test
          </button>
        </div>
      </div>
    </div>
  );
}
