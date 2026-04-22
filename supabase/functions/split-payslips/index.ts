import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pdfText, employees } = await req.json();

    if (!pdfText || !Array.isArray(pdfText) || pdfText.length === 0) {
      return new Response(
        JSON.stringify({ error: "pdfText (array of page texts) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return new Response(
        JSON.stringify({ error: "employees list required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build employee list for the prompt
    const employeeList = employees
      .map((e: { vorname: string; nachname: string; user_id: string }) =>
        `- "${e.vorname} ${e.nachname}" → user_id: "${e.user_id}"`
      )
      .join("\n");

    // Build page text summaries (truncate to avoid token limits)
    const pageTexts = pdfText.map((text: string, i: number) => {
      const truncated = text.substring(0, 3500);
      return `=== SEITE ${i + 1} ===\n${truncated}`;
    }).join("\n\n");

    const prompt = `Du bist ein Assistent, der österreichische Lohnzettel-PDFs analysiert.

Hier ist eine Liste aller Mitarbeiter:
${employeeList}

Hier ist der extrahierte Text aus einem Sammel-PDF mit Lohnzetteln (${pdfText.length} Seiten):

${pageTexts}

Aufgabe:
1) Ordne jede Seite einem Mitarbeiter zu. Lohnzettel können 1 oder mehrere Seiten pro Mitarbeiter umfassen.
   Suche nach Mitarbeiter-Namen, SV-Nummern oder anderen identifizierenden Informationen auf jeder Seite.
   Wenn mehrere aufeinanderfolgende Seiten zum gleichen Mitarbeiter gehören, gruppiere sie zusammen.

2) Extrahiere pro Mitarbeiter die URLAUBSDATEN aus dem Lohnzettel:
   - "urlaubsanspruch": Jahres-Urlaubsanspruch (Gesamt, meist 25/30 Tage oder 200/240 Stunden)
     Typische Bezeichnungen: "Urlaubsanspruch", "Urlaubsanspruch gesamt", "Urlaub Anspruch"
   - "resturlaub": aktuell offener/verbleibender Urlaub zum Stichtag
     Typische Bezeichnungen: "Resturlaub", "Urlaubsrest", "Restanspruch Urlaub", "offener Urlaub"
   - "urlaub_einheit": "tage" oder "stunden" — abhaengig davon, was auf dem Lohnzettel neben den Werten steht
     ("Tage", "d", "T" → "tage"; "Stunden", "h", "Std." → "stunden")
     Falls beide angegeben sind, waehle "tage" als Default.
   - "stichtag": Das Ende des Abrechnungsmonats im Format YYYY-MM-DD (z.B. Abrechnung "04/2026" oder
     "April 2026" → "2026-04-30"). Falls nicht eindeutig: null.

Antworte NUR mit einem validen JSON-Objekt:
{
  "assignments": [
    {
      "employee_name": "Voller Name des Mitarbeiters",
      "matched_user_id": "user_id aus der Liste oben oder null",
      "pages": [0, 1],
      "confidence": "high oder low",
      "urlaubsanspruch": 25,
      "resturlaub": 12,
      "urlaub_einheit": "tage",
      "stichtag": "2026-04-30"
    }
  ],
  "unassigned_pages": [5, 6]
}

Regeln:
- "pages" sind 0-basierte Indizes (Seite 1 = Index 0)
- "confidence": "high" wenn der Name eindeutig erkannt wurde, "low" wenn unsicher
- Seiten ohne erkennbare Zuordnung in "unassigned_pages"
- "matched_user_id" muss exakt einer der user_ids aus der Mitarbeiterliste sein, oder null
- Jede Seite darf nur einem Mitarbeiter zugeordnet werden
- Fehlende Urlaubswerte als null zuruckgeben (nicht 0!)
- Dezimalwerte sind erlaubt (z.B. 12.5)`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 4096,
        temperature: 0,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { assignments: [], unassigned_pages: [] };
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
