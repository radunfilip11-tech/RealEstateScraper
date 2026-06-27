interface StatsBarProps {
  newListings24h: number;
  privateListings24h: number;
  totalListings: number;
}

export default function StatsBar({
  newListings24h,
  privateListings24h,
  totalListings,
}: StatsBarProps) {
  const stats = [
    {
      id: "stat-new",
      label: "Novih oglasa (24h)",
      value: newListings24h,
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      id: "stat-private",
      label: "Privatnih (24h)",
      value: privateListings24h,
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      ),
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      id: "stat-total",
      label: "Ukupno oglasa",
      value: totalListings,
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
      ),
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div id="stats-bar" className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.id}
          id={stat.id}
          className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow duration-200"
        >
          <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg`}>
            {stat.icon}
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {stat.value.toLocaleString("hr-HR")}
            </p>
            <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
