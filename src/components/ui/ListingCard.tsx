import Badge from "./Badge";
import type { Listing } from "@/lib/supabase/types";

interface ListingCardProps {
  listing: Listing;
}

export default function ListingCard({ listing }: ListingCardProps) {
  return (
    <a
      href={listing.url}
      target="_blank"
      rel="noopener noreferrer"
      id={`listing-${listing.external_id}`}
      className="group flex items-stretch bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-200"
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
          <div className="flex items-center text-[10px] text-gray-400 font-medium">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Dodano: {new Date(listing.created_at).toLocaleString("hr-HR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </div>
          
          <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="source" value={listing.source} />
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
  );
}
