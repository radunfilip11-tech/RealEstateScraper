interface BadgeProps {
  variant: "source" | "advertiser" | "property" | "transaction";
  value: string;
}

const sourceColors: Record<string, { bg: string; text: string }> = {
  njuskalo: { bg: "bg-green-50 border-green-200", text: "text-green-700" },
  index: { bg: "bg-red-50 border-red-200", text: "text-red-700" },
  burza: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
};

const advertiserColors: Record<string, { bg: string; text: string }> = {
  Privatni: { bg: "bg-gray-900", text: "text-white" },
  Agencija: { bg: "bg-gray-100 border-gray-200", text: "text-gray-600" },
};

const transactionColors: Record<string, { bg: string; text: string }> = {
  Prodaja: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700" },
  Najam: { bg: "bg-orange-50 border-orange-200", text: "text-orange-700" },
};

export default function Badge({ variant, value }: BadgeProps) {
  let classes = "";

  if (variant === "source") {
    const colors = sourceColors[value.toLowerCase()] || {
      bg: "bg-gray-50 border-gray-200",
      text: "text-gray-600",
    };
    classes = `${colors.bg} ${colors.text} border`;
  } else if (variant === "advertiser") {
    const colors = advertiserColors[value] || {
      bg: "bg-gray-100 border-gray-200",
      text: "text-gray-600",
    };
    classes = `${colors.bg} ${colors.text} border`;
  } else if (variant === "property") {
    classes = "bg-gray-100 text-gray-600 border border-gray-200";
  } else if (variant === "transaction") {
    const colors = transactionColors[value] || {
      bg: "bg-gray-100 border-gray-200",
      text: "text-gray-600",
    };
    classes = `${colors.bg} ${colors.text} border`;
  } else {
    classes = "bg-gray-50 border border-gray-200 text-gray-600";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium leading-tight ${classes}`}
    >
      {value}
    </span>
  );
}
