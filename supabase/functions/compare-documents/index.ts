import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lieferschein, rechnung } = await req.json();

    const formatPositionen = (positionen: any[]) => {
      if (!positionen || positionen.length === 0) return "Keine Positionen";
      return positionen
        .map((p: any, i: number) =>
          `${i + 1}. ${p.material || "?"} | Menge: ${p.menge || "?"} ${p.einheit || ""} | Einzelpreis: ${p.einzelpreis || "?"} | Gesamt: ${p.gesamtpreis || "?"}`
        )
        .join("\n");
    };

    const prompt = `Du bist ein Experte für Buchhaltung und Rechnungsprüfung in einem Bauunternehmen.

Vergleiche den folgenden Lieferschein mit der Rechnung und identifiziere ALLE Unstimmigkeiten detailliert.
Prüfe auch wenn der Lieferant auf den ersten Blick nicht übereinstimmt — es könnte ein Tippfehler oder eine andere Schreibweise sein.

LIEFERSCHEIN:
Lieferant: ${lieferschein.lieferant || "nicht angegeben"}
Betrag: ${lieferschein.betrag != null ? `€ ${Number(lieferschein.betrag).toFixed(2)}` : "nicht angegeben"}
Belegnummer: ${lieferschein.dokument_nummer || "nicht angegeben"}
Positionen:
${formatPositionen(lieferschein.positionen)}

RECHNUNG:
Lieferant: ${rechnung.lieferant || "nicht angegeben"}
Betrag: ${rechnung.betrag != null ? `€ ${Number(rechnung.betrag).toFixed(2)}` : "nicht angegeben"}
Belegnummer: ${rechnung.dokument_nummer || "nicht angegeben"}
Positionen:
${formatPositionen(rechnung.positionen)}

Analysiere:
1. Stimmt der Lieferant überein? (auch ähnliche Namen / Schreibweisen prüfen)
2. Stimmen die Gesamtbeträge überein?
3. Stimmen alle Positionen überein? (Material, Menge, Preis)
4. Gibt es fehlende oder zusätzliche Positionen?
5. Gibt es Preisabweichungen bei einzelnen Positionen?

Antworte NUR als JSON in diesem Format (kein Markdown, kein Text davor oder danach):
{
  "issues": [
    {
      "type": "supplier_mismatch|amount_diff|missing_position|extra_position|price_diff",
      "message": "Konkrete Beschreibung der Unstimmigkeit auf Deutsch",
      "severity": "error|warning|info"
    }
  ],
  "summary": "Kurze Zusammenfassung des Abgleichs auf Deutsch (2-3 Sätze)",
  "matchScore": 0
}

Regeln für matchScore (0-100):
- 100: Alles stimmt perfekt überein
- 80-99: Kleinere Abweichungen (z.B. Schreibweise Lieferant leicht anders)
- 50-79: Mittlere Abweichungen (z.B. Betrag leicht abweichend)
- 0-49: Größere Abweichungen (z.B. falscher Lieferant, große Betragsabweichung, viele fehlende Positionen)

Severity-Regeln:
- "error": Kritische Abweichung (anderer Lieferant, Betragsabweichung > 5%, fehlende Position)
- "warning": Moderate Abweichung (Betragsabweichung 1-5%, Mengenabweichung)
- "info": Kleinere Hinweise (Schreibweise leicht anders, fehlende Nummern)`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error: ${err}`);
    }

    const aiResult = await response.json();
    const text = aiResult.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from text
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { issues: [], summary: text, matchScore: 0 };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
