"use client";

import { useState, type FormEvent } from "react";
import { TrashIcon } from "@/components/icons";
import { useChannels } from "@/lib/channels-context";

export default function KanaelePage() {
  const { channels, addChannel, removeChannel } = useChannels();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    const result = await addChannel(trimmed);
    setIsLoading(false);

    if (result.ok) {
      setInput("");
    } else {
      setError(result.error);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Meine Kanäle</h1>
        <p className="max-w-2xl text-sm text-muted">
          Gespeicherte Kanäle für den Suchmodus „Nur meine Kanäle“ — per
          Kanal-Name, Kanal-URL oder @handle hinzufügen.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="z.B. Dr. Petra Bracht, @handle oder Kanal-URL"
          className="w-full rounded-full border border-line bg-surface px-5 py-3 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Suche…" : "Hinzufügen"}
        </button>
      </form>

      {error ? (
        <div className="w-full rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </div>
      ) : null}

      {channels.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {channels.map((channel) => (
            <li
              key={channel.channelId}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
            >
              {channel.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- externe YouTube-Thumbnail-URL, kein next/image-Loader konfiguriert.
                <img
                  src={channel.thumbnail}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full bg-canvas" />
              )}
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
            Füge oben einen Kanal hinzu, um ihn im Suchmodus „Nur meine Kanäle“ zu nutzen.
          </p>
        </div>
      )}
    </main>
  );
}
