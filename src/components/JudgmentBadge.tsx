import { JUDGMENT_STYLES } from "@/lib/config";
import type { AnalyzedVideo } from "@/lib/types";

export function JudgmentBadge({ video }: { video: AnalyzedVideo }) {
  if (video.status === "kein_transkript") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        Kein Transkript
      </span>
    );
  }

  if (video.status === "fehler") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        Fehler
      </span>
    );
  }

  if (!video.urteil) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
        Wird geprüft…
      </span>
    );
  }

  const style = JUDGMENT_STYLES[video.urteil.gesamturteil];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
