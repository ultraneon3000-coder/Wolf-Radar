// Grobe Deutsch/Englisch-Erkennung als Fallback für Videos, bei denen YouTube
// keine defaultAudioLanguage/defaultLanguage liefert (siehe youtube.ts).
const GERMAN_WORDS = new Set([
  "der", "die", "das", "und", "ist", "nicht", "mit", "für", "warum", "wie",
  "kann", "man", "auch", "sehr", "mehr", "gesund", "ich", "du", "wir", "ihr",
  "sind", "wird", "eine", "einen", "den", "dem", "was", "wenn", "aber", "ohne",
]);
const ENGLISH_WORDS = new Set([
  "the", "and", "why", "how", "with", "you", "your", "this", "that", "what",
  "who", "are", "for", "not", "can", "will", "does", "healthy", "about", "from",
]);

/** Normalisiert einen BCP-47-Sprachcode ("de-DE") auf die Basissprache ("de"). */
export function normalizeLanguage(code?: string | null): string | null {
  if (!code) return null;
  const base = code.split(/[-_]/)[0].toLowerCase();
  return base || null;
}

/** Rät die Sprache anhand von Umlauten/ß oder häufigen Stopwörtern in Titel+Beschreibung. */
export function detectLanguageFromText(text: string): "de" | "en" | null {
  if (/[äöüß]/i.test(text)) return "de";

  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let de = 0;
  let en = 0;
  for (const w of words) {
    if (GERMAN_WORDS.has(w)) de++;
    if (ENGLISH_WORDS.has(w)) en++;
  }
  if (de === 0 && en === 0) return null;
  return de >= en ? "de" : "en";
}
