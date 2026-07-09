"use client";

import { ResultCard } from "@/components/ResultCard";
import { useFavorites } from "@/lib/favorites-context";

export default function FavoritenPage() {
  const { favorites } = useFavorites();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Favoriten</h1>
        <p className="max-w-2xl text-sm text-muted">
          Videos, die du mit dem Stern-Icon auf einer Ergebnis-Karte gespeichert hast.
        </p>
      </header>

      {favorites.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((video) => (
            <ResultCard key={video.videoId} video={video} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-muted">
          <p className="text-sm">Noch keine Favoriten.</p>
          <p className="text-xs">
            Klicke bei Vorgeschlagen oder Suche auf den Stern einer Karte, um sie hier zu sammeln.
          </p>
        </div>
      )}
    </main>
  );
}
