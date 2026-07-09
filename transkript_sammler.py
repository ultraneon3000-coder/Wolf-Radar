#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 YouTube-Transkript-Sammler
 Aufgabe 2 – Fehlinformations-Detektor (Christian Wolf / Vibe-Coder-Bewerbung)
================================================================================

Was dieses Programm macht
-------------------------
1. (optional) Sucht über die YouTube Data API v3 nach einem Suchbegriff und
   holt sich die Video-IDs  – genau der Schritt, den du gestern schon manuell
   im API-Explorer gemacht hast ("honig ist kein zucker").
2. Zieht für jedes Video das Transkript (auch automatisch generierte Untertitel).
   -> Das geht NICHT über deinen API-Key, sondern über die Library
      `youtube-transcript-api`. Der offizielle captions.download-Endpunkt
      funktioniert nur für Videos, die DIR gehoeren – nicht fuer fremde.
3. Speichert alles:
      - transkripte/<video_id>.txt         (lesbar, zum Ueberfliegen)
      - transkripte/transkripte_gesamt.json (das gibst du mir zum Analysieren)

Voraussetzungen (einmalig im Terminal)
--------------------------------------
    pip install youtube-transcript-api requests

Wichtiger Hinweis zur IP
------------------------
Lokal auf deinem Rechner (Wohn-IP) laeuft das problemlos. Sobald das SPAETER
in der Cloud (AWS/GCP/Azure) deployed wird, blockt YouTube die Cloud-IP -> dann
brauchen wir rotierende Residential-Proxies (Webshare) oder eine gehostete
Transkript-API. Fuer JETZT (Sammeln auf deinem Rechner) ist alles gut.
================================================================================
"""

import os
import re
import sys
import json
import time
import argparse
from pathlib import Path

# --- Third-party -------------------------------------------------------------
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api import (
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable,
        RequestBlocked,
        IpBlocked,
    )
except ImportError:
    sys.exit("Fehlt: youtube-transcript-api. Bitte ausfuehren:\n"
             "    pip install youtube-transcript-api requests")

try:
    import requests
except ImportError:
    requests = None  # nur fuer Suche/Metadaten noetig


# ==============================================================================
#  KONFIGURATION  – hier stellst du alles ein
# ==============================================================================

API_KEY      = ""                       # dein YouTube Data API v3 Key.
                                         # Leer = keine Suche, keine Titel/Kanal.

SEARCH_QUERY = ""  # Suchbegriff. Leer lassen ("") wenn du
                                         # die Videos unten fest angibst.

MAX_RESULTS  = 15                        # wie viele Treffer aus der Suche (max 50)

VIDEOS = [ "eX2UU1hze5A",  # Superfood Honig – Dr. Bauhofer
    "lwAmWNTvXeI",  # FAKE HONIG ERKENNEN – Kowallik
    "ybNFSummezI",  # Die Honig Lüge (Manuka) – Kowallik
    "hcfgPhNqFss",  # Honig + Nelken heilt 9 Probleme – Dr. Weber
    "lpdMRV6ISLI",  # (Roh)Honig ist kein Zucker? – WOLF  <- Anker
    "XfOyp4OEYI4",  # Zitronenwasser mit Honig – Endlich Gesundseier
    "zmDhxw2EKtk",  # Zucker vs Honig – Gymperium
    "eS9rs0whtp0",  # Stärkster Entzündungshemmer – FruchtSucht
    "cDmwka0jR1o",  # Honig: Ja oder Nein? – Kowallik
    "J8UpMY0jXwQ",  # Ist Honig gesund? Arzt analysiert – Dr. Selz
    # Feste Video-Liste (URLs ODER 11-stellige IDs). Wird IMMER mitverarbeitet,
    # zusaetzlich zu den Suchergebnissen. Beispiele:
    # "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    # "dQw4w9WgXcQ",
]

LANGUAGES    = ["de", "en"]  # Sprach-Prioritaet fuer das Transkript
TRANSLATE_TO = "de"          # nur fremdsprachige Untertitel da? -> uebersetzen
                             # nach diesem Code. None = nicht uebersetzen.

OUTPUT_DIR    = "transkripte"
SLEEP_BETWEEN = 1.0          # Sekunden Pause zwischen Videos (schont die IP)

# ==============================================================================


# ------------------------------------------------------------------ Helpers ---

def extract_video_id(s: str):
    """Zieht aus URL oder Rohstring die 11-stellige Video-ID."""
    s = s.strip()
    if re.fullmatch(r"[0-9A-Za-z_-]{11}", s):
        return s
    m = re.search(r"(?:v=|/shorts/|/embed/|youtu\.be/|/live/)([0-9A-Za-z_-]{11})", s)
    return m.group(1) if m else None


def youtube_search(query: str, api_key: str, max_results: int):
    """search.list -> Liste von Videos mit Basis-Metadaten."""
    if requests is None:
        sys.exit("Fuer die Suche wird `requests` gebraucht: pip install requests")
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": min(max(max_results, 1), 50),
        "key": api_key,
    }
    r = requests.get(url, params=params, timeout=20)
    if r.status_code != 200:
        print(f"  ! Suche fehlgeschlagen ({r.status_code}): {r.text[:200]}")
        return []
    out = []
    for it in r.json().get("items", []):
        vid = it.get("id", {}).get("videoId")
        if not vid:
            continue
        sn = it.get("snippet", {})
        out.append({
            "video_id": vid,
            "title":    sn.get("title", ""),
            "channel":  sn.get("channelTitle", ""),
            "published": sn.get("publishedAt", ""),
        })
    return out


def fetch_metadata(video_ids, api_key: str):
    """videos.list -> Titel/Kanal fuer fest angegebene Videos (best effort)."""
    if not api_key or requests is None or not video_ids:
        return {}
    meta = {}
    url = "https://www.googleapis.com/youtube/v3/videos"
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i:i + 50]
        params = {"part": "snippet", "id": ",".join(chunk), "key": api_key}
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code != 200:
                continue
            for it in r.json().get("items", []):
                sn = it.get("snippet", {})
                meta[it["id"]] = {
                    "title":   sn.get("title", ""),
                    "channel": sn.get("channelTitle", ""),
                    "published": sn.get("publishedAt", ""),
                }
        except requests.RequestException:
            pass
    return meta


def get_transcript(video_id: str):
    """Holt das beste verfuegbare Transkript. Gibt dict zurueck oder wirft Fehler."""
    api = YouTubeTranscriptApi()
    tlist = api.list(video_id)

    transcript = None
    # 1) Manuelles/generiertes Transkript in Wunschsprache
    try:
        transcript = tlist.find_transcript(LANGUAGES)
    except NoTranscriptFound:
        transcript = None

    # 2) Sonst: irgendein verfuegbares nehmen, ggf. uebersetzen
    if transcript is None:
        any_t = next(iter(tlist), None)
        if any_t is None:
            raise NoTranscriptFound(video_id, LANGUAGES, tlist)
        if TRANSLATE_TO and getattr(any_t, "is_translatable", False):
            transcript = any_t.translate(TRANSLATE_TO)
        else:
            transcript = any_t

    fetched = transcript.fetch()
    raw = fetched.to_raw_data()  # [{'text','start','duration'}, ...]

    full = " ".join(seg["text"].replace("\n", " ") for seg in raw)
    full = re.sub(r"\s+", " ", full).strip()

    return {
        "language":      getattr(transcript, "language", None),
        "language_code": getattr(transcript, "language_code", None),
        "is_generated":  getattr(transcript, "is_generated", None),
        "n_segments":    len(raw),
        "n_words":       len(full.split()),
        "text":          full,
        "segments":      raw,
    }


# --------------------------------------------------------------------- Main ---

def main():
    ap = argparse.ArgumentParser(description="YouTube-Transkript-Sammler")
    ap.add_argument("--query", help="Suchbegriff (ueberschreibt CONFIG)")
    ap.add_argument("--key",   help="API-Key (ueberschreibt CONFIG)")
    ap.add_argument("--max",   type=int, help="max. Suchtreffer")
    ap.add_argument("--out",   help="Ausgabeordner")
    args = ap.parse_args()

    api_key   = args.key   or API_KEY
    query     = args.query if args.query is not None else SEARCH_QUERY
    max_res   = args.max   or MAX_RESULTS
    out_dir   = Path(args.out or OUTPUT_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ---- 1. Ziel-Videos sammeln --------------------------------------------
    targets = {}   # video_id -> metadata dict

    if query and api_key:
        print(f"[Suche] '{query}' ...")
        for hit in youtube_search(query, api_key, max_res):
            targets[hit["video_id"]] = hit
        print(f"[Suche] {len(targets)} Videos gefunden.")
    elif query and not api_key:
        print("[!] SEARCH_QUERY gesetzt, aber kein API_KEY -> Suche uebersprungen.")

    # feste Liste dazu
    manual_ids = []
    for entry in VIDEOS:
        vid = extract_video_id(entry)
        if vid:
            manual_ids.append(vid)
            targets.setdefault(vid, {"video_id": vid})
        else:
            print(f"[!] Konnte keine Video-ID lesen aus: {entry}")

    if manual_ids:
        for vid, m in fetch_metadata(manual_ids, api_key).items():
            targets.setdefault(vid, {"video_id": vid}).update(m)

    if not targets:
        sys.exit("Keine Videos zu verarbeiten. Setze SEARCH_QUERY+API_KEY "
                 "oder fuelle die VIDEOS-Liste.")

    print(f"\n[Start] {len(targets)} Videos, hole Transkripte ...\n")

    # ---- 2. Transkripte holen ----------------------------------------------
    results, ok, fail = [], 0, 0
    for i, (vid, meta) in enumerate(targets.items(), 1):
        title = meta.get("title", "") or vid
        label = title if len(title) <= 60 else title[:57] + "..."
        print(f"[{i}/{len(targets)}] {vid}  {label}")

        rec = dict(meta)
        rec["url"] = f"https://www.youtube.com/watch?v={vid}"
        try:
            t = get_transcript(vid)
            rec.update(t)
            rec["status"] = "ok"
            ok += 1
            # Einzel-TXT
            txt = out_dir / f"{vid}.txt"
            with open(txt, "w", encoding="utf-8") as f:
                f.write(f"# {title}\n")
                f.write(f"# {rec['url']}\n")
                f.write(f"# Sprache: {t['language']} "
                        f"({'auto' if t['is_generated'] else 'manuell'}), "
                        f"{t['n_words']} Woerter\n\n")
                f.write(t["text"])
            print(f"        -> OK  ({t['n_words']} Woerter, {t['language']})")
        except TranscriptsDisabled:
            rec["status"] = "keine_untertitel"; fail += 1
            print("        -> uebersprungen: Untertitel deaktiviert")
        except NoTranscriptFound:
            rec["status"] = "kein_transkript"; fail += 1
            print("        -> uebersprungen: kein Transkript gefunden")
        except VideoUnavailable:
            rec["status"] = "nicht_verfuegbar"; fail += 1
            print("        -> uebersprungen: Video nicht verfuegbar")
        except (RequestBlocked, IpBlocked):
            rec["status"] = "ip_geblockt"; fail += 1
            print("        -> ABBRUCH-Risiko: YouTube blockt deine IP. "
                  "Pause machen / Residential-Proxy noetig.")
        except Exception as e:
            rec["status"] = f"fehler: {type(e).__name__}"; fail += 1
            print(f"        -> Fehler: {type(e).__name__}: {e}")

        results.append(rec)
        if i < len(targets):
            time.sleep(SLEEP_BETWEEN)

    # ---- 3. Gesamt-JSON schreiben ------------------------------------------
    combined = out_dir / "transkripte_gesamt.json"
    with open(combined, "w", encoding="utf-8") as f:
        json.dump({
            "query": query,
            "n_total": len(results),
            "n_ok": ok,
            "n_fail": fail,
            "videos": results,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n=========================================")
    print(f" Fertig: {ok} Transkripte OK, {fail} uebersprungen")
    print(f" Einzeldateien:  {out_dir}/<id>.txt")
    print(f" Gesamt (fuer Analyse):  {combined}")
    print(f"=========================================")


if __name__ == "__main__":
    main()
