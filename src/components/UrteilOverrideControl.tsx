"use client";

import { useState } from "react";
import { JUDGMENT_ORDER, JUDGMENT_STYLES } from "@/lib/config";
import type { Judgment } from "@/lib/config";
import type { UrteilOverride } from "@/lib/types";

interface UrteilOverrideControlProps {
  videoId: string;
  override: UrteilOverride | undefined;
  onChange: (override: UrteilOverride | undefined) => void;
}

// Christian als Experte kann Claudes automatisches Gesamturteil manuell
// überschreiben (Feedback-Feature, Stufe 1) — siehe api/urteil-override/route.ts
// und cache.ts getUrteilOverrides/setUrteilOverride/removeUrteilOverride.
// Rein lokaler UI-Zustand pro Karte (kein Context), da eine Karte in der Regel
// unabhängig von anderen Ansichten derselben Videos lebt.
export function UrteilOverrideControl({ videoId, override, onChange }: UrteilOverrideControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Judgment | null>(override?.gesamturteil ?? null);
  const [notiz, setNotiz] = useState(override?.notiz ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/urteil-override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, gesamturteil: selected, notiz }),
      });
      if (res.ok) {
        onChange({ gesamturteil: selected, notiz: notiz.trim() || null, createdAt: new Date().toISOString() });
        setExpanded(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/urteil-override?videoId=${encodeURIComponent(videoId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onChange(undefined);
        setSelected(null);
        setNotiz("");
        setExpanded(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {override ? "Manuelles Urteil bearbeiten" : "Urteil korrigieren"}
      </button>

      {expanded ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-canvas p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {JUDGMENT_ORDER.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setSelected(j)}
                aria-pressed={selected === j}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  selected === j ? "border-accent bg-accent text-canvas" : "border-line text-muted hover:text-ink"
                }`}
              >
                {JUDGMENT_STYLES[j].label}
              </button>
            ))}
          </div>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="Kurze Begründung (optional)"
            rows={2}
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!selected || saving}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Speichern
            </button>
            {override ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Zurücksetzen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
