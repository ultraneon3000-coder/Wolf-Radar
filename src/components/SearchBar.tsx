"use client";

import { useState, type FormEvent } from "react";
import { RegionModeToggle } from "./RegionModeToggle";
import type { RegionMode } from "@/lib/types";

export function SearchBar({
  onSearch,
  isLoading,
  regionMode,
  onRegionModeChange,
}: {
  onSearch: (query: string) => void;
  isLoading: boolean;
  regionMode: RegionMode;
  onRegionModeChange: (mode: RegionMode) => void;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
      <RegionModeToggle mode={regionMode} onChange={onRegionModeChange} />
      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z.B. Honig gesund, Intervallfasten, Protein…"
          className="w-full rounded-full border border-line bg-surface px-5 py-3 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Suche läuft…" : "Suchen"}
        </button>
      </form>
    </div>
  );
}
