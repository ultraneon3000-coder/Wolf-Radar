"use client";

import { useState, type FormEvent } from "react";
import { ChannelCheckIcon, TrashIcon } from "@/components/icons";
import { useChannels } from "@/lib/channels-context";
import { formatCompactNumber } from "@/lib/format";
import type { ChannelCandidate } from "@/lib/types";

function ChannelAvatar({ thumbnail }: { thumbnail: string }) {
  return thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element -- externe YouTube-Thumbnail-URL, kein next/image-Loader konfiguriert.
    <img src={thumbnail} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <div className="h-10 w-10 shrink-0 rounded-full bg-canvas" />
  );
}

export default function KanaelePage() {
  const { channels, isSaved, searchChannels, addChannel, removeChannel } = useChannels();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ChannelCandidate[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isSearching) return;

    setIsSearching(true);
    setError(null);
    setCandidates(null);
    const result = await searchChannels(trimmed);
    setIsSearching(false);

    if (result.ok) {
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        setError(`Kein Kanal gefunden für "${trimmed}".`);
      }
    } else {
      setError(result.error);
    }
  }

  async function handleAdd(candidate: ChannelCandidate) {
    setAddingId(candidate.channelId);
    const result = await addChannel(candidate);
    setAddingId(null);
    if (!result.ok) setError(result.error);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Meine Kanäle</h1>
        <p className="max-w-2xl text-sm text-muted">
          Gespeicherte Kanäle für den Suchmodus „Nur meine Kanäle“ — suche per
          Kanal-Name, Kanal-URL oder @handle und wähle den richtigen Treffer aus.
        </p>
      </header>

      <form onSubmit={handleSearch} className="flex w-full gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="z.B. Dr. Petra Bracht, @handle oder Kanal-URL"
          className="w-full rounded-full border border-line bg-surface px-5 py-3 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSearching ? "Suche…" : "Suchen"}
        </button>
      </form>

      {error ? (
        <div className="w-full rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </div>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Treffer — anklicken zum Hinzufügen
          </h2>
          <ul className="flex flex-col gap-2">
            {candidates.map((candidate) => {
              const saved = isSaved(candidate.channelId);
              return (
                <li key={candidate.channelId}>
                  <button
                    type="button"
                    onClick={() => handleAdd(candidate)}
                    disabled={saved || addingId === candidate.channelId}
                    className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/40 disabled:cursor-not-allowed"
                  >
                    <ChannelAvatar thumbnail={candidate.thumbnail} />
                    <span className="flex-1 truncate text-sm font-medium text-ink">
                      {candidate.title}
                    </span>
                    {candidate.subscriberCount !== null ? (
                      <span className="shrink-0 text-xs text-muted">
                        {formatCompactNumber(candidate.subscriberCount)} Abonnenten
                      </span>
                    ) : null}
                    {saved ? (
                      <ChannelCheckIcon className="h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-accent">
                        {addingId === candidate.channelId ? "Speichert…" : "Hinzufügen"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {channels.length > 0 ? (
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Gespeicherte Kanäle
          </h2>
        ) : null}

        {channels.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {channels.map((channel) => (
              <li
                key={channel.channelId}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <ChannelAvatar thumbnail={channel.thumbnail} />
                <span className="flex-1 truncate text-sm font-medium text-ink">
                  {channel.title}
                </span>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.channelId)}
                  aria-label={`${channel.title} entfernen`}
                  className="shrink-0 rounded-md p-2 text-muted transition hover:bg-canvas hover:text-bad"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-muted">
            <p className="text-sm">Noch keine Kanäle gespeichert.</p>
            <p className="text-xs">
              Suche oben nach einem Kanal, um ihn im Suchmodus „Nur meine Kanäle“ zu nutzen.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
