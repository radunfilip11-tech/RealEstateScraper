'use client';

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  accent?: 'emerald' | 'rose';
}

function parseTime(value: string): [string, string] {
  const [rawHours = '00', rawMinutes = '00'] = value.split(':');
  const hours = rawHours.padStart(2, '0').slice(0, 2);
  const minutes = rawMinutes.padStart(2, '0').slice(0, 2);
  return [hours, minutes];
}

export default function TimeInput({
  value,
  onChange,
  accent = 'emerald',
}: TimeInputProps) {
  const [hours, minutes] = parseTime(value);

  const focusRing =
    accent === 'emerald'
      ? 'focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400'
      : 'focus-within:ring-2 focus-within:ring-rose-500/20 focus-within:border-rose-400';

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 transition-colors ${focusRing}`}
    >
      <select
        value={hours}
        onChange={(e) => onChange(`${e.target.value}:${minutes}`)}
        className="w-9 cursor-pointer appearance-none bg-transparent text-center font-mono tabular-nums focus:outline-none"
        aria-label="Sati"
      >
        {Array.from({ length: 24 }, (_, i) => {
          const h = String(i).padStart(2, '0');
          return (
            <option key={h} value={h}>
              {h}
            </option>
          );
        })}
      </select>
      <span className="select-none font-medium text-gray-300">:</span>
      <select
        value={minutes}
        onChange={(e) => onChange(`${hours}:${e.target.value}`)}
        className="w-9 cursor-pointer appearance-none bg-transparent text-center font-mono tabular-nums focus:outline-none"
        aria-label="Minute"
      >
        {Array.from({ length: 60 }, (_, i) => {
          const m = String(i).padStart(2, '0');
          return (
            <option key={m} value={m}>
              {m}
            </option>
          );
        })}
      </select>
    </div>
  );
}
