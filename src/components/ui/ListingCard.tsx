import Badge from "./Badge";
import type { Listing } from "@/lib/supabase/types";

interface ListingCardProps {
  listing: Listing;
  onHide?: () => void;
}

export default function ListingCard({ listing, onHide }: ListingCardProps) {
  return (
    <div className={`group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-200 ${listing.hidden ? 'opacity-50 grayscale' : ''}`}>
      {onHide && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHide();
          }}
          title={listing.hidden ? "Oglas je sakriven" : "Sakrij oglas"}
          className="absolute top-2 right-2 z-10 p-2 bg-white/90 backdrop-blur-sm rounded-full text-gray-400 hover:text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </button>
      )}
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        id={`listing-${listing.external_id}`}
        className="flex items-stretch w-full"
      >
      {/* Thumbnail */}
      <div className="relative w-[180px] min-h-[130px] bg-gray-100 flex-shrink-0 overflow-hidden">
        {listing.image_url ? (
          <img
            src={listing.image_url}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors line-clamp-1 mb-1.5">
            {listing.title}
          </h3>

          {/* Location */}
          {listing.location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                />
              </svg>
              <span className="truncate">{listing.location}</span>
            </div>
          )}

          {/* Description */}
          {listing.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2">
              {listing.description}
            </p>
          )}
        </div>

        {/* Bottom row: badges + price */}
        <div className="flex flex-col gap-2 mt-2">
          {/* Date added */}
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
            <div className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Skenirano: {new Date(listing.created_at).toLocaleString("hr-HR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </div>
            {listing.published_at && (
              <div className="flex items-center text-blue-500">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Njuškalo: {new Date(listing.published_at).toLocaleString("hr-HR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="source" value={listing.source} />
            {listing.status && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                listing.status === 'Novi' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {listing.status === 'Novi' && (
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143z" />
                  </svg>
                )}
                {listing.status === 'Obnovljen' && (
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {listing.status}
              </span>
            )}
            {listing.is_promoted && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Istaknuto
              </span>
            )}
            {listing.transaction_type && (
              <Badge variant="transaction" value={listing.transaction_type} />
            )}
            {listing.advertiser_type && (
              <Badge variant="advertiser" value={listing.advertiser_type} />
            )}
            {listing.property_type && (
              <Badge variant="property" value={listing.property_type} />
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {listing.size_m2 && (
              <span className="text-xs text-gray-500 font-medium">
                {listing.size_m2} m²
              </span>
            )}
            {listing.price && (
              <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                {listing.price}
              </span>
            )}
          </div>
          </div>
          </div>
        </div>
      </a>
    </div>
  );
}
