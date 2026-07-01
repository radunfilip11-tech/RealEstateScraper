"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [chatId, setChatId] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestNotification = async () => {
    if (!chatId) {
      setTestResult("Unesite Telegram Chat ID");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
      });
      const data = await res.json();

      if (res.ok) {
        setTestResult(
          `${data.message || "Obavijest poslana!"} (${data.count || 0} oglasa)`,
        );
      } else {
        setTestResult(data.error || "Greška pri slanju obavijesti");
      }
    } catch (err) {
      setTestResult(`Greška: ${(err as Error).message}`);
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

      {/* Telegram Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-blue-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Telegram obavijesti
            </h3>
            <p className="text-xs text-gray-500">
              Primajte obavijesti o novim oglasima u Telegram grupu
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="chat-id"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Chat ID
            </label>
            <input
              type="text"
              id="chat-id"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              ID grupe ili chata (doznajte ga od @RawDataBot u Telegramu)
            </p>
          </div>

          <button
            id="test-notification-button"
            onClick={handleTestNotification}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
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
                testResult.startsWith("Greška")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
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
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"
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
            <h4 className="text-sm font-semibold text-blue-800">
              Telegram Bot konfiguracija
            </h4>
            <p className="text-xs text-blue-700 mt-1">
              Za Telegram obavijesti potreban je bot token od @BotFather.
              Dodajte
              <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded text-[11px] font-mono">
                TELEGRAM_BOT_TOKEN
              </code>
              u <strong>.env.local</strong> datoteku. Bot mora biti dodan u
              ciljnu grupu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
