"use client";

import { useState, type FormEvent } from "react";
import { ChannelsOnlyToggle } from "./ChannelsOnlyToggle";
import { RegionModeToggle } from "./RegionModeToggle";
import { useChannels } from "@/lib/channels-context";
import type { RegionMode } from "@/lib/types";

export function SearchBar({
  onSearch,
  isLoading,
  regionMode,
  onRegionModeChange,
  channelsOnly,
  onChannelsOnlyChange,
}: {
  onSearch: (query: string) => void;
  isLoading: boolean;
  regionMode: RegionMode;
  onRegionModeChange: (mode: RegionMode) => void;
  channelsOnly: boolean;
  onChannelsOnlyChange: (active: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const { channels } = useChannels();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    // Ohne "Nur meine Kanäle" bleibt ein Suchbegriff Pflicht — im
    // Kanal-Modus ist ein leerer Suchbegriff erlaubt und bedeutet "zeig mir
    // die neuesten Videos aus meinen gespeicherten Kanälen".
    if (!trimmed && !channelsOnly) return;
    onSearch(trimmed);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <RegionModeToggle mode={regionMode} onChange={onRegionModeChange} />
        <ChannelsOnlyToggle
          active={channelsOnly}
          onChange={onChannelsOnlyChange}
          disabled={channels.length === 0}
        />
      </div>
      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            channelsOnly
              ? "Suchbegriff (optional) — leer lassen für die neuesten Videos"
              : "z.B. Honig gesund, Intervallfasten, Protein…"
          }
          className="w-full rounded-full border border-line bg-surface px-5 py-3 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={isLoading || (!value.trim() && !channelsOnly)}
          className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Suche läuft…" : "Suchen"}
        </button>
      </form>
    </div>
  );
}
