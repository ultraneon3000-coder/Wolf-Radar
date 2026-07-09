"use client";

import { useState, type FormEvent } from "react";

// Beweist, dass die App mit jedem YouTube-Video funktioniert (nicht nur den
// Demo-Videos) — nimmt serverseitig immer den echten Live-Weg, siehe
// api/analyze/route.ts (url-Parameter).
export function CustomVideoForm({
  onSubmit,
  isLoading,
  error,
}: {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-line bg-surface p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="custom-video-url" className="shrink-0 text-xs font-medium text-muted">
          Eigenes Video analysieren <span className="text-ink/60">(live, jedes Video)</span>
        </label>
        <input
          id="custom-video-url"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="YouTube-Link oder Video-ID einfügen…"
          className="flex-1 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Prüfe…" : "Prüfen"}
        </button>
      </div>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </form>
  );
}
