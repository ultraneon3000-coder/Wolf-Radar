# Wolf-Radar 🐺

**KI-gestützte Faktenprüfung von Videos.** Wolf-Radar analysiert die in einem Video getroffenen Aussagen und prüft sie automatisiert auf faktische Korrektheit – Aussage für Aussage, jeweils mit Urteil und nachvollziehbarer Begründung.

> Entstanden als praxisnaher Test-Case für einen Influencer-Kanal, um Behauptungen aus Videos schnell und transparent gegenzuprüfen.

🔗 **Live-Demo:** [wolf-radar-chi.vercel.app](https://wolf-radar-chi.vercel.app) &nbsp;·&nbsp; *(Deployment derzeit vorübergehend offline)*

---

## Was die App macht

- **Video eingeben** – per Link (YouTube, Instagram, TikTok) oder direkt über einen Suchbegriff auf der Startmaske.
- **Transkript ziehen** – der gesprochene Inhalt des Videos wird extrahiert und aufbereitet.
- **KI-Analyse** – die einzelnen Aussagen werden von einem Sprachmodell (Anthropic Claude) auf ihren Wahrheitsgehalt geprüft.
- **Transparentes Ergebnis** – jede Aussage wird einzeln dargestellt, inklusive Urteil und Begründung, sodass man die Bewertung nachvollziehen kann.

---

## Tech-Stack

| Bereich        | Technologie                          |
| -------------- | ------------------------------------ |
| Frontend       | Next.js (React, TypeScript)          |
| Backend / DB   | Supabase (Auth, Datenbank)           |
| KI / Analyse   | Anthropic Claude API                 |
| Datenaufbereitung | Python (Transkript-Sammler)       |
| Hosting        | Vercel                               |

---

## Ablauf (Architektur in Kurzform)

```
Eingabe (Link / Suchbegriff)
        │
        ▼
Transkript-Extraktion  ──►  Aufbereitung
        │
        ▼
KI-Faktenprüfung (strukturierter Prompt an Claude)
        │
        ▼
Strukturiertes Urteil pro Aussage  ──►  Darstellung im Frontend
```

## Prüflogik & Qualitätssicherung

Die Faktenprüfung folgt einer definierten Prüflogik statt einer freien KI-Antwort. Im Repository dokumentiert:

- **`Prueflogik_Prompt.md`** – der strukturierte Prompt, der die Aussagen-Bewertung steuert.
- **`Goldset_Pruefprotokoll.md`** – ein Prüfprotokoll gegen einen festen Referenz-Datensatz („Gold-Set"), um die Qualität der Bewertungen systematisch zu kontrollieren.

---

## Lokales Setup

```bash
# Repository klonen
git clone https://github.com/ultraneon3000-coder/Wolf-Radar.git
cd Wolf-Radar

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen anlegen (.env.local) – siehe unten

# Entwicklungsserver starten
npm run dev
```

Die App läuft anschließend unter [http://localhost:3000](http://localhost:3000).

### Benötigte Umgebungsvariablen

Lege eine Datei `.env.local` an (wird **nicht** ins Repository hochgeladen). Die genauen Schlüsselnamen findest du in deiner bestehenden `.env.local`; typischerweise:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

---

## Entwicklungshinweis

Wolf-Radar wurde **KI-gestützt entwickelt** (mit Anthropic Claude als Werkzeug). Konzept, Architektur, Datenfluss und die Umsetzung zum lauffähigen Produkt stammen von mir – die KI war Entwicklungswerkzeug, nicht Autor des Projekts.

## Status

Funktionsfähiger Prototyp / Test-Case. Weiterentwicklung offen.

---

*Entwickelt von [@ultraneon3000-coder](https://github.com/ultraneon3000-coder)*
