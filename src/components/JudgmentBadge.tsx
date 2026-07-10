import { JUDGMENT_STYLES } from "@/lib/config";
import { effectiveJudgment, type AnalyzedVideo } from "@/lib/types";
import { PencilIcon } from "./icons";

export function JudgmentBadge({ video }: { video: AnalyzedVideo }) {
  // Ein gesetztes Override hat Vorrang vor Status/Original — auch falls
  // die automatische Prüfung "kein Transkript"/"Fehler" ergeben hat, zählt
  // ab dann Christians manuelles Urteil.
  const judgment = effectiveJudgment(video);
  if (judgment) {
    const style = JUDGMENT_STYLES[judgment];
    const isOverridden = Boolean(video.urteilOverride);
    return (
      <span
        title={isOverridden ? "Manuell angepasstes Urteil" : undefined}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.badge}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {style.label}
        {isOverridden ? <PencilIcon className="h-3 w-3" /> : null}
      </span>
    );
  }

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

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
      Wird geprüft…
    </span>
  );
}
