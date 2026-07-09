"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AnalyzedVideo } from "./types";

interface SeenContextValue {
  seen: AnalyzedVideo[];
  isSeen: (videoId: string) => boolean;
  toggleSeen: (video: AnalyzedVideo) => void;
}

const SeenContext = createContext<SeenContextValue | null>(null);

// Spiegelt FavoritesProvider (favorites-context.tsx) 1:1 — ein zentraler
// Provider statt eines Hooks pro Karte, damit alle Karten dieselbe,
// synchron gehaltene "gesehen"-Liste sehen.
export function SeenProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<Record<string, AnalyzedVideo>>({});

  useEffect(() => {
    fetch("/api/seen")
      .then((r) => r.json())
      .then((data: { seen: AnalyzedVideo[] }) => {
        const map: Record<string, AnalyzedVideo> = {};
        for (const v of data.seen) map[v.videoId] = v;
        setSeen(map);
      })
      .catch(() => {
        // Kein Zugriff möglich (z.B. Dateisystem-Fehler) -> einfach leer starten.
      });
  }, []);

  const isSeen = useCallback((videoId: string) => videoId in seen, [seen]);

  const toggleSeen = useCallback(
    (video: AnalyzedVideo) => {
      const wasSeen = video.videoId in seen;

      setSeen((prev) => {
        const next = { ...prev };
        if (wasSeen) delete next[video.videoId];
        else next[video.videoId] = video;
        return next;
      });

      const request = wasSeen
        ? fetch(`/api/seen?videoId=${encodeURIComponent(video.videoId)}`, {
            method: "DELETE",
          })
        : fetch("/api/seen", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ video }),
          });

      request.catch(() => {
        // Bei Netzwerkfehler: optimistisches Update zurückrollen.
        setSeen((prev) => {
          const next = { ...prev };
          if (wasSeen) next[video.videoId] = video;
          else delete next[video.videoId];
          return next;
        });
      });
    },
    [seen]
  );

  return (
    <SeenContext.Provider value={{ seen: Object.values(seen), isSeen, toggleSeen }}>
      {children}
    </SeenContext.Provider>
  );
}

export function useSeen(): SeenContextValue {
  const ctx = useContext(SeenContext);
  if (!ctx) {
    throw new Error("useSeen muss innerhalb von <SeenProvider> verwendet werden.");
  }
  return ctx;
}
