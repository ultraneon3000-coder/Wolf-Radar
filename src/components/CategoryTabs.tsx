import { CATEGORIES } from "@/lib/config";

export const ALL_CATEGORY = "alle";

export function CategoryTabs({
  active,
  onChange,
  counts,
}: {
  active: string;
  onChange: (id: string) => void;
  counts: Record<string, number>;
}) {
  const tabs = [{ id: ALL_CATEGORY, label: "Alle" }, ...CATEGORIES];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const count = counts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              isActive
                ? "border-accent bg-accent text-canvas"
                : "border-line bg-surface text-muted hover:border-accent/40 hover:text-ink"
            }`}
          >
            {tab.label}
            {count > 0 ? (
              <span className="ml-1.5 opacity-60">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
