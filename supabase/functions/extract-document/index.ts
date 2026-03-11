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
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "imageBase64 required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPdf = mediaType === "application/pdf";
    const isImage = typeof mediaType === "string" && mediaType.startsWith("image/");

    // Skip unsupported file types
    if (!isPdf && !isImage) {
      return new Response(
        JSON.stringify({
          lieferant: null,
          datum: null,
          belegnummer: null,
          betrag: null,
          preistyp: "unbekannt",
          positionen: [],
          qualitaet: "nicht_bild",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build content block depending on file type:
    // PDFs → native file input (GPT-4o reads all pages as text, no quality loss)
    // Images → image_url (vision)
    const fileContent = isPdf
      ? {
          type: "file",
          file: {
            filename: "document.pdf",
            file_data: `data:application/pdf;base64,${imageBase64}`,
          },
        }
      : {
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${imageBase64}`,
          },
        };

    const PROMPT = `Analysiere dieses Dokument (Rechnung, Lieferschein oder Lagerlieferschein) vollständig — alle Seiten, alle Zeilen.

Antworte NUR mit einem validen JSON-Objekt (kein Markdown, kein Text davor oder danach):

{
  "lieferant": "Name des Lieferanten/Firma",
  "datum": "YYYY-MM-DD",
  "belegnummer": "Beleg-/Rechnungsnummer",
  "betrag": 0.00,
  "preistyp": "brutto/netto/unbekannt",
  "positionen": [
    {
      "material": "exakter Materialname wie im Dokument",
      "menge": 1.0,
      "einheit": "Stk/m/m²/m³/kg/t/l/etc",
      "einzelpreis": 0.00,
      "gesamtpreis": 0.00
    }
  ],
  "qualitaet": "gut/mittel/schlecht"
}

WICHTIGE REGELN:
- "positionen": Extrahiere JEDE einzelne Zeile/Position — lückenlos, von Seite 1 bis zur letzten Seite. Auch wenn es 100+ Positionen sind — überspringe keine einzige.
- "preistyp": Steht meist im Dokument ("inkl. MwSt." = brutto, "exkl. MwSt." / "netto" = netto). Falls nicht erkennbar → "unbekannt".
- "menge", "einzelpreis", "gesamtpreis": Immer als reine Zahlen (kein Währungszeichen, keine Einheit).
- "gesamtpreis" pro Position: Menge × Einzelpreis — falls Einzelpreis null, dann auch null.
- "betrag": Der Gesamtbetrag des gesamten Dokuments als reine Zahl.
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
              fileContent,
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
      // Try to extract JSON from markdown-wrapped response
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
