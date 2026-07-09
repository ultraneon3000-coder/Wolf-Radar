#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kleines Subprozess-Hilfsskript fuer src/lib/transcript.ts.

Grund: Die JS-Bibliothek `youtube-transcript` wird von YouTube derzeit beim
Abruf des eigentlichen Transkript-Texts mit HTTP 429 (Captcha-Seite) blockiert,
obwohl die Videos deutsche Untertitel haben. `youtube-transcript-api` (Python,
siehe transkript_sammler.py) funktioniert fuer dieselben Videos einwandfrei.
Daher ruft die App dieses Skript als Subprozess auf, statt der JS-Bibliothek.

Aufruf:   python fetch_transcript.py <video_id>
Erfolg (exit 0), stdout:  {"ok": true, "text": "...", "language": "...",
                           "language_code": "...", "is_generated": true}
Fehler (exit != 0), stdout: {"ok": false, "error_type": "...", "message": "..."}
"""

import json
import os
import sys

# Windows-Konsolen laufen oft mit cp1252/cp437 statt UTF-8 — ohne diese
# Umstellung werden deutsche Umlaute in der JSON-Ausgabe falsch kodiert
# (erscheinen auf Node-Seite als "?"). reconfigure() gibt es seit Python 3.7.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")


def build_proxy_config():
    """Optionaler Residential-Proxy (z.B. Webshare) über TRANSCRIPT_PROXY_URL,
    siehe transkript_sammler.py-Hinweis zu Cloud-Deploys. Format: eine einzelne
    Proxy-URL wie "http://user:pass@host:port", die für http UND https genutzt
    wird. Wird die Variable nicht gesetzt, läuft alles ohne Proxy wie bisher."""
    proxy_url = os.environ.get("TRANSCRIPT_PROXY_URL", "").strip()
    if not proxy_url:
        return None
    from youtube_transcript_api.proxies import GenericProxyConfig

    return GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)


def emit(payload: dict, code: int) -> None:
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def main() -> None:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        emit({"ok": False, "error_type": "invalid_args", "message": "Video-ID fehlt"}, 1)
        return

    video_id = sys.argv[1].strip()
    languages = [a for a in sys.argv[2:] if a.strip()] or ["de", "en"]

    try:
        from youtube_transcript_api import (
            NoTranscriptFound,
            TranscriptsDisabled,
            VideoUnavailable,
            YouTubeTranscriptApi,
        )
    except ImportError as e:
        emit({"ok": False, "error_type": "missing_dependency", "message": str(e)}, 1)
        return

    try:
        api = YouTubeTranscriptApi(proxy_config=build_proxy_config())
        tlist = api.list(video_id)

        transcript = None
        try:
            transcript = tlist.find_transcript(languages)
        except NoTranscriptFound:
            transcript = None

        if transcript is None:
            any_t = next(iter(tlist), None)
            if any_t is None:
                raise NoTranscriptFound(video_id, languages, tlist)
            transcript = (
                any_t.translate("de") if getattr(any_t, "is_translatable", False) else any_t
            )

        fetched = transcript.fetch()
        raw = fetched.to_raw_data()
        text = " ".join(seg["text"].replace("\n", " ") for seg in raw)
        text = " ".join(text.split())

        if not text:
            emit({"ok": False, "error_type": "empty", "message": f"Leeres Transkript ({video_id})"}, 2)
            return

        emit(
            {
                "ok": True,
                "text": text,
                "language": getattr(transcript, "language", None),
                "language_code": getattr(transcript, "language_code", None),
                "is_generated": getattr(transcript, "is_generated", None),
            },
            0,
        )
    except TranscriptsDisabled:
        emit({"ok": False, "error_type": "disabled", "message": f"Untertitel deaktiviert ({video_id})"}, 2)
    except NoTranscriptFound:
        emit({"ok": False, "error_type": "not_found", "message": f"Kein Transkript gefunden ({video_id})"}, 2)
    except VideoUnavailable:
        emit({"ok": False, "error_type": "video_unavailable", "message": f"Video nicht verfuegbar ({video_id})"}, 2)
    except Exception as e:
        # RequestBlocked/IpBlocked (je nach Bibliotheksversion vorhanden oder nicht)
        # werden bewusst hier ueber den Klassennamen erkannt statt per Import,
        # damit das Skript auch mit aelteren/neueren Versionen der Bibliothek laeuft.
        type_name = type(e).__name__
        raw_message = str(e)

        # Volle technische Details (Stacktrace-Text, GitHub-Issue-Hinweise der
        # Bibliothek etc.) NUR ins Server-Log — "message" unten geht bis in die
        # UI durch (siehe transcript.ts/ResultCard.tsx) und muss kurz + sauber bleiben.
        print(f"[fetch_transcript] {video_id}: {type_name}: {raw_message}", file=sys.stderr)

        if "Blocked" in type_name:
            error_type = "ip_blocked"
        elif type_name == "VideoUnplayable" and "available in your country" in raw_message.lower():
            error_type = "geo_blocked"
        else:
            error_type = "transcript_error"

        emit({"ok": False, "error_type": error_type, "message": f"{type_name} ({video_id})"}, 3)


if __name__ == "__main__":
    main()
