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

    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64 || typeof mediaType !== "string" || !mediaType.startsWith("image/")) {
      return new Response(
        JSON.stringify({ error: "imageBase64 (image/*) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const PROMPT = `Du siehst eine Rechnung oder einen Lieferschein. Lies den Text buchstabengenau.

Antworte NUR mit einem validen JSON-Objekt (kein Markdown, kein Text davor oder danach):

{
  "lieferant": "Name des Lieferanten/Firma",
  "datum": "YYYY-MM-DD",
  "belegnummer": "Beleg-/Rechnungsnummer",
  "betrag": 0.00,
  "preistyp": "brutto/netto/unbekannt",
  "positionen": [
    { "material": "...", "menge": 1.0, "einheit": "Stk", "einzelpreis": 0.00, "gesamtpreis": 0.00 }
  ],
  "qualitaet": "gut/mittel/schlecht"
}

STRIKTE REGELN — KEINE AUSNAHMEN:
- "material": BUCHSTABENGENAU abschreiben wie es im Dokument steht. NICHT umformulieren. NICHT übersetzen. NICHT paraphrasieren. Siehst du "Bolo Carl XS" → schreibe "Bolo Carl XS". Siehst du "Pax Fix 25 kg" → schreibe "Pax Fix 25 kg". Erfinde KEINE Namen.
- "positionen": Jede einzelne Zeile/Position aus dem Dokument — lückenlos, alle Seiten, von oben nach unten. Nichts weglassen.
- "einzelpreis": Preis pro Einheit als reine Zahl (kein €-Zeichen, keine Einheit).
- "gesamtpreis": Menge × Einzelpreis als reine Zahl. Falls im Dokument angegeben, diesen Wert nehmen.
- "betrag": Gesamtbetrag des gesamten Dokuments als reine Zahl.
- "preistyp": "inkl. MwSt." im Dokument → "brutto" | "exkl. MwSt." / "netto" → "netto" | sonst "unbekannt".
- "qualitaet": "gut" = Text klar lesbar | "mittel" = teilweise lesbar | "schlecht" = kaum lesbar.
- Felder die nicht erkennbar sind → null.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mediaType};base64,${imageBase64}` },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI extraction failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "{}";

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      extracted = match ? JSON.parse(match[0]) : {};
    }

    return new Response(
      JSON.stringify(extracted),
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
