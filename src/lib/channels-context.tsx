"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SavedChannel } from "./types";

type AddChannelResult = { ok: true } | { ok: false; error: string };

interface ChannelsContextValue {
  channels: SavedChannel[];
  isSaved: (channelId: string) => boolean;
  addChannel: (input: string) => Promise<AddChannelResult>;
  removeChannel: (channelId: string) => void;
}

const ChannelsContext = createContext<ChannelsContextValue | null>(null);

// Spiegelt FavoritesProvider (favorites-context.tsx) — anders als dort ist
// "hinzufügen" hier kein rein optimistisches Toggle: die channelId ist erst
// bekannt, nachdem der Server den Kanal-Namen/die URL aufgelöst hat.
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

  const addChannel = useCallback(async (input: string): Promise<AddChannelResult> => {
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = (await res.json()) as { channel?: SavedChannel; error?: string };
      if (!res.ok || !data.channel) {
        return { ok: false, error: data.error ?? "Kanal konnte nicht hinzugefügt werden." };
      }
      const channel = data.channel;
      setChannels((prev) => ({ ...prev, [channel.channelId]: channel }));
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
      value={{ channels: Object.values(channels), isSaved, addChannel, removeChannel }}
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
