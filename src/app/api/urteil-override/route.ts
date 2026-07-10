import { NextRequest, NextResponse } from "next/server";
import { removeUrteilOverride, setUrteilOverride } from "@/lib/cache";
import { JUDGMENT_ORDER, type Judgment } from "@/lib/config";

// Nutzt Supabase (Cache) — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

function isJudgment(value: unknown): value is Judgment {
  return typeof value === "string" && (JUDGMENT_ORDER as string[]).includes(value);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { videoId?: string; gesamturteil?: string; notiz?: string }
    | null;

  if (!body?.videoId || !isJudgment(body.gesamturteil)) {
    return NextResponse.json(
      { error: "videoId und ein gültiges gesamturteil (seriös/gemischt/fragwürdig) sind erforderlich." },
      { status: 400 }
    );
  }

  const notiz = body.notiz?.trim() || null;
  await setUrteilOverride(body.videoId, body.gesamturteil, notiz);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId fehlt" }, { status: 400 });
  }
  await removeUrteilOverride(videoId);
  return NextResponse.json({ ok: true });
}
