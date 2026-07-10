"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ChannelCandidate, SavedChannel } from "./types";

type AddChannelResult = { ok: true } | { ok: false; error: string };
type SearchChannelsResult =
  | { ok: true; candidates: ChannelCandidate[] }
  | { ok: false; error: string };

// Kern-Feld, das ein Kanal mindestens braucht, um gespeichert zu werden —
// Thumbnail ist optional: fehlt es (z.B. schnelles Speichern von einer
// Video-Karte, die nur channelId+Titel kennt), löst der Server es serverseitig auf.
type ChannelToSave = { channelId: string; title: string; thumbnail?: string };

interface ChannelsContextValue {
  channels: SavedChannel[];
  isSaved: (channelId: string) => boolean;
  searchChannels: (query: string) => Promise<SearchChannelsResult>;
  addChannel: (channel: ChannelToSave) => Promise<AddChannelResult>;
  removeChannel: (channelId: string) => void;
}

const ChannelsContext = createContext<ChannelsContextValue | null>(null);

// Spiegelt FavoritesProvider (favorites-context.tsx) — anders als dort ist
// "hinzufügen" hier kein rein optimistisches Toggle: der Nutzer wählt zuerst
// einen konkreten Kandidaten aus einer Trefferliste (siehe searchChannels),
// bevor addChannel ihn tatsächlich speichert.
export function ChannelsProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<Record<string, SavedChannel>>({});

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data: { channels: SavedChannel[] }) => {
        const map: Record<string, SavedChannel> = {};
        for (const c of data.channels) map[c.channelId] = c;
        setChannels(map);
      })
      .catch(() => {
        // Kein Zugriff möglich (z.B. Dateisystem-Fehler) -> einfach leer starten.
      });
  }, []);

  const isSaved = useCallback((channelId: string) => channelId in channels, [channels]);

  const searchChannels = useCallback(async (query: string): Promise<SearchChannelsResult> => {
    try {
      const res = await fetch(`/api/channels?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { candidates?: ChannelCandidate[]; error?: string };
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Kanal-Suche fehlgeschlagen." };
      }
      return { ok: true, candidates: data.candidates ?? [] };
    } catch {
      return { ok: false, error: "Verbindung zum Server unterbrochen." };
    }
  }, []);

  const addChannel = useCallback(async (channel: ChannelToSave): Promise<AddChannelResult> => {
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(channel),
      });
      const data = (await res.json()) as { channel?: SavedChannel; error?: string };
      if (!res.ok || !data.channel) {
        return { ok: false, error: data.error ?? "Kanal konnte nicht hinzugefügt werden." };
      }
      const saved = data.channel;
      setChannels((prev) => ({ ...prev, [saved.channelId]: saved }));
      return { ok: true };
    } catch {
      return { ok: false, error: "Verbindung zum Server unterbrochen." };
    }
  }, []);

  const removeChannel = useCallback((channelId: string) => {
    setChannels((prev) => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
    fetch(`/api/channels?channelId=${encodeURIComponent(channelId)}`, {
      method: "DELETE",
    }).catch(() => {
      // Netzwerkfehler beim Entfernen: kein Rollback, die Liste wird beim
      // nächsten Neuladen wieder mit dem Server-Stand abgeglichen.
    });
  }, []);

  return (
    <ChannelsContext.Provider
      value={{
        channels: Object.values(channels),
        isSaved,
        searchChannels,
        addChannel,
        removeChannel,
      }}
    >
      {children}
    </ChannelsContext.Provider>
  );
}

export function useChannels(): ChannelsContextValue {
  const ctx = useContext(ChannelsContext);
  if (!ctx) {
    throw new Error("useChannels muss innerhalb von <ChannelsProvider> verwendet werden.");
  }
  return ctx;
}
