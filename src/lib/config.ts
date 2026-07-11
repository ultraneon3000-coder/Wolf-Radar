// Zentrale Konfiguration für Kategorien, Urteils-Schwellen und Modell-Parameter.
// Bewusst von der Logik getrennt (siehe Prueflogik_Prompt.md), damit Wolf das
// später anpassen kann, ohne Code zu lesen.

export type Judgment = "seriös" | "gemischt" | "fragwürdig";
export type StatementJudgment = "korrekt" | "irreführend" | "falsch" | "unbelegt";

export interface CategoryDef {
  id: string;
  label: string;
}

// Muss mit den Kategorien im System-Prompt (Prueflogik_Prompt.md) übereinstimmen.
export const CATEGORIES: CategoryDef[] = [
  { id: "wundermittel", label: "Wundermittel" },
  { id: "nährstoff_verteufelt", label: "Nährstoff verteufelt" },
  { id: "strategie", label: "Strategie" },
  { id: "wolf_angegriffen", label: "Wolf angegriffen" },
  { id: "sonstiges", label: "Sonstiges" },
];

export const JUDGMENT_ORDER: Judgment[] = ["fragwürdig", "gemischt", "seriös"];

// Urteils-Badges sind bewusst vom Marken-Akzent (Lime) getrennt — eigene,
// rein semantische Farben (siehe theme.css: --color-ok/--color-warn/--color-bad).
export const JUDGMENT_STYLES: Record<
  Judgment,
  { label: string; badge: string; dot: string }
> = {
  "seriös": {
    label: "Seriös",
    badge: "bg-ok/10 text-ok border-ok/30",
    dot: "bg-ok",
  },
  "gemischt": {
    label: "Gemischt",
    badge: "bg-warn/10 text-warn border-warn/30",
    dot: "bg-warn",
  },
  "fragwürdig": {
    label: "Fragwürdig",
    badge: "bg-bad/10 text-bad border-bad/30",
    dot: "bg-bad",
  },
};

export const STATEMENT_JUDGMENT_STYLES: Record<StatementJudgment, string> = {
  korrekt: "text-ok",
  irreführend: "text-warn",
  falsch: "text-bad",
  unbelegt: "text-warn",
};

export const SEARCH_CONFIG = {
  // Wie viele Videos pro Seite geholt werden ("Mehr laden" holt jeweils eine
  // weitere Seite dieser Größe über den YouTube-nextPageToken).
  pageSize: 10,
  // Wie viele Videos gleichzeitig (Transkript + Analyse) verarbeitet werden.
  concurrency: 4,
  // Sicherheitsgrenze für "Nur meine Kanäle": maximal so viele
  // Playlist-Seiten (à 50 Videos, 1 Quota-Einheit je Seite) werden pro Kanal
  // und Anfrage nachgeladen, wenn der Stichwort-Filter viele Treffer
  // ausschließt (siehe api/analyze/route.ts fetchChannelUploadsUpToDepth).
  // 40 Seiten = 2000 Videos/Kanal — selbst bei 5 gespeicherten Kanälen im
  // Worst Case 200 Quota-Einheiten (playlistItems.list kostet nur 1 Einheit/
  // Seite), unproblematisch beim 10.000er-Tageslimit. Höher gesetzt als
  // ursprünglich (10 = 500 Videos), weil das bei sehr postfreudigen Kanälen
  // (z.B. fast täglich Shorts) schon nach wenigen Monaten griff und ältere,
  // thematisch passende Videos verdeckte, die die normale YouTube-Suche
  // (durchsucht den kompletten Kanal-Bestand server-seitig) sehr wohl fand.
  channelsMaxDepth: 40,
};

export const ANALYSIS_CONFIG = {
  // "aktuelles Sonnet" gemäß Prueflogik_Prompt.md — günstig + gut genug für diese Aufgabe.
  model: "claude-sonnet-5",
  maxTokens: 4096,
  // Bei ungültigem JSON: wie oft erneut versucht wird (mit Zusatz-Hinweis).
  maxRetries: 1,
};

export const TRANSCRIPT_CONFIG = {
  preferredLanguages: ["de", "en"],
  // Mindestabstand zwischen Transkript-Anfragen an YouTube, siehe
  // transkript_sammler.py (SLEEP_BETWEEN) — reduziert das Risiko eines
  // vorübergehenden IP-Blocks (IpBlocked) bei vielen Videos in Folge.
  minRequestIntervalMs: 1200,
};

// „Wolfs Themen" für die Vorgeschlagen-Ansicht (Radar-Startseite). Feste Liste
// für diese erste Version. In einer späteren Ausbaustufe werden die Themen aus
// Wolfs echter Reaction-Historie abgeleitet statt aus einer festen Liste hier.
export const WOLF_TOPICS: string[] = [
  "Honig",
  "Protein",
  "Intervallfasten",
  "Süßstoffe",
  "Kalorienzählen",
];

// Wie lange ein fehlgeschlagenes Ergebnis im (In-Memory-)Fehler-Cache bleibt,
// bevor für dasselbe Video erneut ein Transkript-Abruf versucht wird.
// Wie lange ein Stichwort-Suchergebnis (search.list, 100 Quota-Einheiten) in
// Supabase gecacht wird (siehe cache.ts getCachedSearch/setCachedSearch),
// bevor dieselbe Suche erneut YouTube kostet. Kurz gehalten, damit neue
// Videos zeitnah auftauchen — der Cache soll nur Doppel-Anfragen (Reload,
// Themen-Rotation, "Erneuern") abfangen, keine echte Aktualität ersetzen.
export const SEARCH_CACHE_TTL_MS = 2.5 * 60 * 60 * 1000;

export const FAILURE_CACHE_TTL_MS = {
  // "kein Transkript" ist praktisch ein dauerhafter Fakt über das Video (Untertitel
  // deaktiviert o.ä.) — deshalb lange merken, spart unnötige Wiederholungsversuche.
  kein_transkript: 24 * 60 * 60 * 1000,
  // Ein IP-Block/Rate-Limit ist vorübergehend — kurz merken, damit spätere Suchen
  // nach Ablauf automatisch wieder einen echten Versuch starten.
  fehler: 10 * 60 * 1000,
};
