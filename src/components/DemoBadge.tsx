// Dezenter Hinweis, dass gerade Beispieldaten statt Live-YouTube-Daten
// angezeigt werden (siehe DEMO_MODE in .env.local).
export function DemoBadge() {
  return (
    <span
      title="Zeigt lokale Beispieldaten statt Live-YouTube-Suche. Das freie „Eigenes Video“-Feld bleibt live."
      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
    >
      Demo
    </span>
  );
}
