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

interface FavoritesContextValue {
  favorites: AnalyzedVideo[];
  isFavorite: (videoId: string) => boolean;
  toggleFavorite: (video: AnalyzedVideo) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

// Ein zentraler Provider statt eines Hooks pro Karte — sonst würde jede
// ResultCard ihre eigene Kopie der Favoriten-Liste laden (unnötige Requests,
// nicht synchron miteinander).
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Record<string, AnalyzedVideo>>({});

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((data: { favorites: AnalyzedVideo[] }) => {
        const map: Record<string, AnalyzedVideo> = {};
        for (const v of data.favorites) map[v.videoId] = v;
        setFavorites(map);
      })
      .catch(() => {
        // Kein Favoriten-Zugriff möglich (z.B. Dateisystem-Fehler) -> einfach leer starten.
      });
  }, []);

  const isFavorite = useCallback(
    (videoId: string) => videoId in favorites,
    [favorites]
  );

  const toggleFavorite = useCallback(
    (video: AnalyzedVideo) => {
      const wasFavorite = video.videoId in favorites;

      setFavorites((prev) => {
        const next = { ...prev };
        if (wasFavorite) delete next[video.videoId];
        else next[video.videoId] = video;
        return next;
      });

      const request = wasFavorite
        ? fetch(`/api/favorites?videoId=${encodeURIComponent(video.videoId)}`, {
            method: "DELETE",
          })
        : fetch("/api/favorites", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ video }),
          });

      request.catch(() => {
        // Bei Netzwerkfehler: optimistisches Update zurückrollen.
        setFavorites((prev) => {
          const next = { ...prev };
          if (wasFavorite) next[video.videoId] = video;
          else delete next[video.videoId];
          return next;
        });
      });
    },
    [favorites]
  );

  return (
    <FavoritesContext.Provider value={{ favorites: Object.values(favorites), isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites muss innerhalb von <FavoritesProvider> verwendet werden.");
  }
  return ctx;
}
