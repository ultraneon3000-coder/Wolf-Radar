"use client";

import { ResultCard } from "@/components/ResultCard";
import { useSeen } from "@/lib/seen-context";

export default function GesehenPage() {
  const { seen } = useSeen();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Schon gesehen</h1>
        <p className="max-w-2xl text-sm text-muted">
          Videos, die du mit dem Augen-Icon auf einer Ergebnis-Karte ausgeblendet hast. Klicke
          erneut auf das Icon, um ein Video wieder in Suche und Vorgeschlagen einzublenden.
        </p>
      </header>

      {seen.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {seen.map((video) => (
            <ResultCard key={video.videoId} video={video} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-muted">
          <p className="text-sm">Noch keine Videos ausgeblendet.</p>
          <p className="text-xs">
            Klicke bei Vorgeschlagen oder Suche auf das Augen-Icon einer Karte, um sie hier zu sammeln.
          </p>
        </div>
      )}
    </main>
  );
}
