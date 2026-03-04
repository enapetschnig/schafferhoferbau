import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendReportRequest {
  pdfBase64: string;
  pdfFilename: string;
  emailHtml: string;
  subject: string;
  kundeEmail?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, pdfFilename, emailHtml, subject, kundeEmail }: SendReportRequest = await req.json();

    if (!pdfBase64 || !subject) {
      return new Response(
        JSON.stringify({ error: "pdfBase64 and subject are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("[1] Fetching office email from settings...");
    const { data: setting, error: settingError } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "disturbance_report_email")
      .maybeSingle();

    if (settingError) console.error("[1] Settings query error:", settingError.message);

    const officeEmail = setting?.value || "holzknecht.natursteine@gmail.com";
    console.log("[1] Office email:", officeEmail);

    const recipients = [officeEmail];
    if (kundeEmail) recipients.push(kundeEmail);

    console.log("[2] Sending email to:", recipients);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Holzknecht Natursteine <noreply@chrisnapetschnig.at>",
        to: recipients,
        subject,
        html: emailHtml,
        attachments: [{ filename: pdfFilename, content: pdfBase64 }],
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("[3] Resend API error:", resendResponse.status, errorText);
      throw new Error(`Resend API error: ${resendResponse.status} - ${errorText}`);
    }

    const emailData = await resendResponse.json();
    console.log("[3] Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, emailResponse: emailData }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error sending disturbance report:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
