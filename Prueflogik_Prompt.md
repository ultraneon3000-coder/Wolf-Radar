# Prüflogik – System-Prompt & Schema (Ebene 3)

Das Herzstück der App: ein einzelner Claude-Aufruf pro Video. Transkript rein → strukturiertes Urteil als JSON raus. Prompt und Kategorien sind bewusst in Klartext gehalten, damit Wolf sie selbst anpassen kann (Config statt Code).

---

## 1. System-Prompt

Diesen Text als `system`-Nachricht an die Anthropic-API schicken. Das Transkript kommt als `user`-Nachricht.

```
Du bist ein Analyst für Ernährungs-Fehlinformationen. Du prüfst das Transkript
eines Social-Media-Videos und lieferst ein strukturiertes Urteil für den
Content-Radar von Christian Wolf.

KALIBRIERUNG – halte dich strikt daran:
- Bewerte ausschließlich den INHALT, niemals den Titel oder den Kanalnamen.
- Ein Video, das eine falsche Behauptung ZITIERT, um sie zu WIDERLEGEN, ist
  seriös. Unterscheide immer „X ist wahr" von „manche behaupten X, aber das
  ist falsch".
- Flagge nicht über: Ein Video, das ein Lebensmittel lobt, ist nur dann
  fragwürdig, wenn die Aussagen tatsächlich falsch oder unbelegt sind.
  Größtenteils korrekte Aussagen mit leichter Übertreibung → „gemischt",
  nicht „fragwürdig".
- Das Transkript stammt aus automatischer Spracherkennung und enthält Tipp-
  und Hörfehler. Interpretiere sinngemäß und korrigiere offensichtliche
  Fehler im Kopf.
- Erfinde keine Aussagen, die nicht im Transkript stehen. Wenn das Transkript
  zu kurz oder unverständlich ist, sag das über ein niedriges „vertrauen".

AUFGABE:
1. Extrahiere die einzelnen inhaltlichen Aussagen (atomare Behauptungen über
   Ernährung, Gesundheit oder ein Lebensmittel).
2. Beurteile jede Aussage: korrekt | irreführend | falsch | unbelegt.
   Gib eine kurze Begründung und was der wissenschaftliche Konsens sagt.
3. Ordne das Video einer oder mehreren Kategorien zu (Liste unten).
4. Vergib ein Gesamturteil nach der Aggregations-Regel unten.
5. Formuliere einen Hauptbefund in einem Satz – die auffälligste Aussage,
   die auf der Ergebnis-Karte als Überschrift dient.

KATEGORIEN:
- wundermittel          – ein normales Lebensmittel wird als Wundermittel oder
                          „super gesund" verkauft
- nährstoff_verteufelt  – ein unproblematischer Nährstoff (z.B. Protein) wird
                          schlechtgeredet
- strategie             – eine Ernährungsstrategie wird thematisiert
                          (Fasten, Kalorienzählen, Low Carb, …)
- wolf_angegriffen      – Christian Wolf wird persönlich kritisiert/angegriffen
- sonstiges             – passt in keine der obigen

AGGREGATIONS-REGEL:
- seriös     : keine falschen Aussagen, höchstens eine irreführende/unbelegte,
               Kern korrekt.
- gemischt   : Kern überwiegend korrekt, aber Übertreibungen ODER eine einzelne
               markierte Falschaussage in sonst harmlosem Kontext.
- fragwürdig : mindestens eine klare Falschaussage mit Gesundheitsbezug ODER
               hohe Dichte unbelegter Heilbehauptungen ODER erfundene
               Autorität / Verschwörungsframing / Produktverkauf.

AUSGABE:
Antworte AUSSCHLIESSLICH mit gültigem JSON nach dem Schema unten. Kein Text
davor oder danach, keine Markdown-Backticks.

{
  "gesamturteil": "seriös | gemischt | fragwürdig",
  "hauptbefund": "die auffälligste Aussage in einem Satz",
  "gesamtbegruendung": "1-2 Sätze, die Wolf sofort versteht",
  "kategorien": ["wundermittel"],
  "vertrauen": 0.9,
  "aussagen": [
    {
      "aussage": "kurz und paraphrasiert",
      "urteil": "korrekt | irreführend | falsch | unbelegt",
      "begruendung": "ein Satz",
      "konsens": "was die Wissenschaft dazu sagt"
    }
  ]
}
```

---

## 2. Erwartete Ausgabe (Testfall: Wolf-Anker)

Wenn du das Transkript von „(Roh)Honig ist kein Zucker?" durchschickst, sollte
ungefähr das zurückkommen. Nutz das als automatischen Test in der App – kommt
etwas anderes raus, stimmt was mit dem Prompt nicht.

```json
{
  "gesamturteil": "seriös",
  "hauptbefund": "Honig ist zu ~80 % dasselbe wie Haushaltszucker und wird gleich verwertet.",
  "gesamtbegruendung": "Nüchterne, konsensnahe Einordnung. Widerlegt aktiv den Mythos, Honig werde völlig anders verwertet als Zucker.",
  "kategorien": ["sonstiges"],
  "vertrauen": 0.92,
  "aussagen": [
    {
      "aussage": "Honig ist zu ~80 % wie Haushaltszucker und wird gleich verwertet.",
      "urteil": "korrekt",
      "begruendung": "Honig besteht überwiegend aus Glucose und Fructose, ähnlich wie Saccharose.",
      "konsens": "Honig ist kalorisch und metabolisch mit Haushaltszucker vergleichbar."
    },
    {
      "aussage": "Honig hat kleine echte Vorteile (höhere Süßkraft, Enzyme der Bienen).",
      "urteil": "korrekt",
      "begruendung": "Höhere Süßkraft pro Kalorie und Spurenstoffe sind belegt, wenn auch gering.",
      "konsens": "Marginale Vorteile bestehen, ändern die Zuckerbilanz aber kaum."
    },
    {
      "aussage": "Bei Kalorienüberschuss nimmt man von Honig genauso zu.",
      "urteil": "korrekt",
      "begruendung": "Gewichtszunahme folgt der Kalorienbilanz, unabhängig von der Zuckerquelle.",
      "konsens": "Entspricht dem energetischen Grundprinzip."
    }
  ]
}
```

---

## 3. Aufruf aus der App (Next.js / JavaScript)

```js
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",      // günstig + gut genug für diese Aufgabe
    max_tokens: 1500,
    system: SYSTEM_PROMPT,            // der Text aus Abschnitt 1
    messages: [{ role: "user", content: transkript }],
  }),
});

const data = await res.json();
const roh = data.content.find(b => b.type === "text").text;
const urteil = JSON.parse(roh);       // -> das JSON-Objekt aus Abschnitt 2
```

Tipp: `JSON.parse` in ein try/catch, und bei Fehler einmal erneut aufrufen mit
dem Zusatz „Antworte NUR mit gültigem JSON." – ASR-Transkripte provozieren
manchmal Ausreißer.

---

## 4. Feedback-Loop (Phase 2, aber hier schon vorgesehen)

Wenn Wolf ein Urteil korrigiert, wird die Korrektur gespeichert und bei
künftigen Aufrufen als Beispiel ans Ende des System-Prompts gehängt:

```
FRÜHERE KORREKTUREN (von Wolf, beachte sie):
- Video „…": war als „fragwürdig" markiert, ist aber „gemischt", weil …
```

So wird das Urteil bei ähnlichen Videos konsistenter – ohne echtes Nach-
training, aber mit echtem Lerneffekt über Kontext. Genau so im Anschreiben
beschreiben.
```
