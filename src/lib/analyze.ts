import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";
import { ANALYSIS_CONFIG } from "./config";
import type { Urteil } from "./types";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY fehlt in .env.local");
    }
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

/** Manche Antworten haben trotz Anweisung Markdown-Backticks — trotzdem robust parsen. */
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function isValidUrteil(value: unknown): value is Urteil {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gesamturteil === "string" &&
    typeof v.hauptbefund === "string" &&
    typeof v.gesamtbegruendung === "string" &&
    Array.isArray(v.kategorien) &&
    typeof v.vertrauen === "number" &&
    Array.isArray(v.aussagen)
  );
}

async function callClaudeOnce(transcript: string, extraHint?: string): Promise<Urteil> {
  const client = getClient();
  const response = await client.messages.create({
    model: ANALYSIS_CONFIG.model,
    max_tokens: ANALYSIS_CONFIG.maxTokens,
    // Reine Extraktions-/Klassifikationsaufgabe — kein Thinking nötig (Kosten/Latenz).
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: extraHint ? `${transcript}\n\n${extraHint}` : transcript,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude hat keinen Text-Inhalt zurückgegeben.");
  }

  const parsed: unknown = JSON.parse(extractJsonText(textBlock.text));
  if (!isValidUrteil(parsed)) {
    throw new Error("Claude-Antwort entspricht nicht dem erwarteten JSON-Schema.");
  }
  return parsed;
}

// Kartentext im UI (video.error) bei Analyse-Fehlern — bewusst kurz und ohne
// technische Details (Anthropic-API gibt z.B. rohe JSON-Fehlerobjekte mit
// Statuscode/Billing-Details zurück, siehe cache.ts/ResultCard.tsx).
const GENERIC_ANALYSIS_ERROR_MESSAGE =
  "Die Analyse dieses Videos ist fehlgeschlagen. Bitte später erneut versuchen.";

/**
 * Prüft ein Transkript per Claude gegen den System-Prompt aus Prueflogik_Prompt.md.
 * Bei ungültigem JSON (ASR-Transkripte provozieren gelegentlich Ausreißer): ein
 * erneuter Versuch mit explizitem Zusatz-Hinweis, wie im Prompt-Dokument beschrieben.
 */
export async function analyzeTranscript(transcript: string): Promise<Urteil> {
  try {
    return await callClaudeOnce(transcript);
  } catch (firstError) {
    if (ANALYSIS_CONFIG.maxRetries < 1) {
      console.error("[analyze] Claude-Aufruf fehlgeschlagen:", firstError);
      throw new Error(GENERIC_ANALYSIS_ERROR_MESSAGE);
    }
    try {
      return await callClaudeOnce(transcript, "Antworte NUR mit gültigem JSON.");
    } catch (secondError) {
      console.error(
        "[analyze] Claude-Aufruf zweimal fehlgeschlagen:",
        firstError,
        secondError
      );
      throw new Error(GENERIC_ANALYSIS_ERROR_MESSAGE);
    }
  }
}
