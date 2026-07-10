import type { RegionMode } from "@/lib/types";

const OPTIONS: { value: RegionMode; label: string }[] = [
  { value: "de", label: "Deutschland/Deutsch" },
  { value: "international", label: "International/Alle" },
];

export function RegionModeToggle({
  mode,
  onChange,
}: {
  mode: RegionMode;
  onChange: (mode: RegionMode) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line bg-surface p-1 text-xs">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={mode === o.value}
          className={`rounded-full px-3.5 py-1.5 font-medium transition ${
            mode === o.value
              ? "bg-accent text-canvas"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
