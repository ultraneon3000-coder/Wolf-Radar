"use client";

import { useState } from "react";
import { CATEGORIES, STATEMENT_JUDGMENT_STYLES } from "@/lib/config";
import { formatCompactNumber, formatDate } from "@/lib/format";
import { useChannels } from "@/lib/channels-context";
import { useFavorites } from "@/lib/favorites-context";
import { useSeen } from "@/lib/seen-context";
import type { AnalyzedVideo } from "@/lib/types";
import { JudgmentBadge } from "./JudgmentBadge";
import { ChannelAddIcon, ChannelCheckIcon, EyeIcon, EyeOffIcon, StarIcon } from "./icons";

function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function ResultCard({ video }: { video: AnalyzedVideo }) {
  const [expanded, setExpanded] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(video.videoId);
  const { isSeen, toggleSeen } = useSeen();
  const seen = isSeen(video.videoId);
  const { isSaved: isChannelSaved, addChannel, removeChannel } = useChannels();
  const channelSaved = isChannelSaved(video.channelId);
  const url = video.sourceUrl;

  function handleToggleChannel() {
    if (channelSaved) {
      removeChannel(video.channelId);
    } else {
      addChannel({ channelId: video.channelId, title: video.channelTitle });
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition hover:border-accent/30">
      <div className="relative aspect-video bg-canvas">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
          {video.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- externe YouTube-Domain, kein next/image-Loader konfiguriert
            <img
              src={video.thumbnail}
              alt={video.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}
        </a>
        <button
          type="button"
          onClick={() => toggleFavorite(video)}
          aria-label={favorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
          aria-pressed={favorite}
          className="absolute right-2 top-2 rounded-full bg-canvas/70 p-1.5 backdrop-blur transition hover:bg-canvas"
        >
          <StarIcon
            filled={favorite}
            className={`h-4 w-4 ${favorite ? "text-accent" : "text-ink"}`}
          />
        </button>
        <button
          type="button"
          onClick={() => toggleSeen(video)}
          aria-label={seen ? "Wieder als ungesehen markieren" : "Als gesehen markieren"}
          aria-pressed={seen}
          className="absolute bottom-2 left-2 rounded-full bg-canvas/70 p-1.5 backdrop-blur transition hover:bg-canvas"
        >
          {seen ? (
            <EyeOffIcon className="h-4 w-4 text-accent" />
          ) : (
            <EyeIcon className="h-4 w-4 text-ink" />
          )}
        </button>
        {video.platform === "youtube" ? (
          // "Meine Kanäle" ist eine YouTube-API-Funktion (channelId muss zu
          // YouTube gehören) — bei TikTok/Instagram gäbe es keine echte
          // channelId, das Symbol würde nur einen nicht funktionierenden
          // Eintrag anlegen.
          <button
            type="button"
            onClick={handleToggleChannel}
            aria-label={
              channelSaved
                ? `${video.channelTitle} aus "Meine Kanäle" entfernen`
                : `${video.channelTitle} zu "Meine Kanäle" hinzufügen`
            }
            aria-pressed={channelSaved}
            title={
              channelSaved
                ? `${video.channelTitle} aus "Meine Kanäle" entfernen`
                : `${video.channelTitle} zu "Meine Kanäle" hinzufügen`
            }
            className="absolute bottom-2 right-2 rounded-full bg-canvas/70 p-1.5 backdrop-blur transition hover:bg-canvas"
          >
            {channelSaved ? (
              <ChannelCheckIcon className="h-4 w-4 text-accent" />
            ) : (
              <ChannelAddIcon className="h-4 w-4 text-ink" />
            )}
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 text-sm font-semibold text-ink hover:underline"
            title={video.title}
          >
            {video.title}
          </a>
          <JudgmentBadge video={video} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="font-medium text-ink/80">{video.channelTitle}</span>
          <span>{formatDate(video.publishedAt)}</span>
          <span>{formatCompactNumber(video.viewCount)} Aufrufe</span>
          {video.channelSubscriberCount > 0 ? (
            <span>{formatCompactNumber(video.channelSubscriberCount)} Abonnenten</span>
          ) : null}
        </div>

        {video.urteil ? (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h3 className="text-sm font-semibold text-ink">{video.urteil.hauptbefund}</h3>
            <p className="text-sm text-muted">{video.urteil.gesamtbegruendung}</p>

            {video.urteil.kategorien.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {video.urteil.kategorien.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted"
                  >
                    {categoryLabel(cat)}
                  </span>
                ))}
              </div>
            ) : null}

            {video.urteil.aussagen.length > 0 ? (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-xs font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  {expanded
                    ? "Einzelne Aussagen verbergen"
                    : `${video.urteil.aussagen.length} Aussagen anzeigen`}
                </button>

                {expanded ? (
                  <ul className="mt-2 flex flex-col gap-2">
                    {video.urteil.aussagen.map((a, i) => (
                      <li key={i} className="rounded-lg bg-canvas p-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-ink/80">{a.aussage}</span>
                          <span
                            className={`shrink-0 font-semibold ${STATEMENT_JUDGMENT_STYLES[a.urteil]}`}
                          >
                            {a.urteil}
                          </span>
                        </div>
                        <p className="mt-1 text-muted">{a.begruendung}</p>
                        <p className="mt-0.5 italic text-muted/80">Konsens: {a.konsens}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : video.status === "kein_transkript" ? (
          <p className="border-t border-line pt-3 text-sm text-muted">
            Für dieses Video ist kein Transkript verfügbar (keine Untertitel).
          </p>
        ) : video.status === "fehler" ? (
          <p className="border-t border-line pt-3 text-sm text-bad">
            {video.error ?? "Bei der Prüfung ist ein Fehler aufgetreten."}
          </p>
        ) : (
          <div className="flex items-center gap-2 border-t border-line pt-3 text-sm text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
            Transkript wird geholt &amp; geprüft…
          </div>
        )}
      </div>
    </article>
  );
}
