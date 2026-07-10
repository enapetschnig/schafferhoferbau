import { createClient } from "https://esm.sh/@supabase/supabase-js@2.79.0";

// CORS — analog zu send-invitation.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Kategorie = "lehrling" | "facharbeiter" | "vorarbeiter" | "extern" | "bauherr";

interface CreateEmployeeAccountRequest {
  vorname: string;
  nachname: string;
  kategorie: Kategorie;
  email?: string;
  telefon?: string;
  stundenlohn?: number;
  /** attach-Modus: statt neuem employees-Insert wird der Account an den
   *  bestehenden employees-Datensatz mit dieser ID gehaengt. */
  mode?: "create" | "attach";
  employeeId?: string;
}

// Working-Hours-Defaults — gespiegelt von src/lib/workingHours.ts.
// Wird in Deno gebraucht, weshalb es hier dupliziert ist.
const DEFAULT_SCHEDULE = {
  mo: { start: "06:30", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 10 },
  di: { start: "06:30", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 10 },
  mi: { start: "07:00", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 9.5 },
  "do": { start: "07:00", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 9.5 },
  fr: { start: null, end: null, pause: 0, hours: 0 },
  sa: { start: null, end: null, pause: 0, hours: 0 },
  so: { start: null, end: null, pause: 0, hours: 0 },
};

const LEHRLING_SCHEDULE = {
  mo: { start: "07:00", end: "16:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 8.5 },
  di: { start: "07:00", end: "16:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 8.5 },
  mi: { start: "07:00", end: "16:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 8.5 },
  "do": { start: "07:00", end: "16:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 8.5 },
  fr: { start: "07:00", end: "12:00", pause: 0, hours: 5 },
  sa: { start: null, end: null, pause: 0, hours: 0 },
  so: { start: null, end: null, pause: 0, hours: 0 },
};

const DEFAULT_SCHWELLENWERT = { mo: 10, di: 10, mi: 9.5, "do": 9.5, fr: 0, sa: 0, so: 0 };

const EXTERNAL_LIKE: Kategorie[] = ["extern", "bauherr"];
const VALID_KATEGORIEN: Kategorie[] = ["lehrling", "facharbeiter", "vorarbeiter", "extern", "bauherr"];

// 32-char Random-Password, kryptografisch zufaellig — der Admin kennt es nicht.
function generateRandomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "A").replace(/\//g, "B").replace(/=/g, "C");
}

function generatePseudoEmail(): string {
  return `noreply+${crypto.randomUUID()}@schafferhoferbau.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Caller authentifizieren
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    // Admin-Check
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!roleRow || roleRow.role !== "administrator") {
      return json({ success: false, error: "Forbidden: Admin access required" }, 403);
    }

    // Eingabe parsen
    const body = (await req.json()) as CreateEmployeeAccountRequest;
    const mode = body.mode === "attach" ? "attach" : "create";
    let vorname = (body.vorname || "").trim();
    let nachname = (body.nachname || "").trim();
    let kategorie = body.kategorie;
    const telefon = body.telefon?.trim() || null;
    const stundenlohn = typeof body.stundenlohn === "number" ? body.stundenlohn : null;

    // attach-Modus: bestehenden employees-Datensatz laden und Stammdaten
    // von dort uebernehmen (Frontend muss sie nicht mitschicken).
    let attachEmployee: { id: string; vorname: string; nachname: string; kategorie: string | null; user_id: string | null } | null = null;
    if (mode === "attach") {
      if (!body.employeeId) {
        return json({ success: false, error: "employeeId ist im attach-Modus erforderlich" }, 400);
      }
      const { data: emp, error: empLoadErr } = await admin
        .from("employees")
        .select("id, vorname, nachname, kategorie, user_id")
        .eq("id", body.employeeId)
        .maybeSingle();
      if (empLoadErr || !emp) {
        return json({ success: false, error: "Mitarbeiter nicht gefunden" }, 404);
      }
      if (emp.user_id) {
        return json({ success: false, error: "Dieser Mitarbeiter hat bereits einen App-Account" }, 400);
      }
      attachEmployee = emp;
      vorname = emp.vorname;
      nachname = emp.nachname;
      kategorie = (emp.kategorie as Kategorie) || "facharbeiter";
    }

    if (!vorname || !nachname) {
      return json({ success: false, error: "Vorname und Nachname sind erforderlich" }, 400);
    }
    if (!kategorie || !VALID_KATEGORIEN.includes(kategorie)) {
      return json({ success: false, error: "Ungueltige Kategorie" }, 400);
    }

    // Email-Handling: leer → Pseudo-Email
    const inputEmail = body.email?.trim() || "";
    const email = inputEmail || generatePseudoEmail();
    const password = generateRandomPassword();

    const isExternalLike = EXTERNAL_LIKE.includes(kategorie);

    // Account erstellen — Trigger handle_new_user legt profiles + user_roles an
    const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { vorname, nachname },
    });

    if (createErr || !createRes?.user) {
      // Typischer Fall: Email bereits vergeben
      const msg = createErr?.message || "Account konnte nicht angelegt werden";
      const userFriendly = msg.toLowerCase().includes("already")
        ? "Diese E-Mail wird bereits verwendet. Bitte eine andere Adresse angeben oder das Email-Feld leer lassen."
        : msg;
      return json({ success: false, error: userFriendly }, 400);
    }

    const newUserId = createRes.user.id;

    // profiles.is_active = true (Admin-angelegt = freigeschaltet)
    // Trigger hat profiles bereits mit is_active=false angelegt — wir aktualisieren.
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ is_active: true, vorname, nachname })
      .eq("id", newUserId);
    if (profileErr) {
      // best-effort, weiter machen
      console.error("profile activate error:", profileErr);
    }

    // attach-Modus: bestehenden Datensatz mit dem neuen Account verknuepfen,
    // Stammdaten bleiben unangetastet.
    if (mode === "attach" && attachEmployee) {
      const { error: attachErr } = await admin
        .from("employees")
        .update({ user_id: newUserId })
        .eq("id", attachEmployee.id)
        .is("user_id", null);
      if (attachErr) {
        await admin.auth.admin.deleteUser(newUserId).catch(() => {});
        return json({ success: false, error: `Account-Verknuepfung fehlgeschlagen: ${attachErr.message}` }, 400);
      }
      return json({
        success: true,
        userId: newUserId,
        employeeId: attachEmployee.id,
        pseudoEmail: !inputEmail,
      }, 200);
    }

    // create-Modus: employees-Row anlegen
    const employeeRow: Record<string, unknown> = {
      user_id: newUserId,
      vorname,
      nachname,
      email: inputEmail || null, // Pseudo-Emails nicht im employees-Datensatz speichern
      telefon,
      kategorie,
      is_external: isExternalLike,
      stundenlohn,
    };

    if (!isExternalLike) {
      if (kategorie === "lehrling") {
        employeeRow.regelarbeitszeit = LEHRLING_SCHEDULE;
      } else {
        employeeRow.regelarbeitszeit = DEFAULT_SCHEDULE;
      }
      employeeRow.wochen_soll_stunden = 39;
      employeeRow.schwellenwert = DEFAULT_SCHWELLENWERT;
    } else {
      employeeRow.regelarbeitszeit = null;
      employeeRow.wochen_soll_stunden = null;
      employeeRow.schwellenwert = null;
    }

    const { data: empData, error: empErr } = await admin
      .from("employees")
      .insert(employeeRow)
      .select("id")
      .single();

    if (empErr) {
      // employees-Insert fehlgeschlagen — auth.users-Eintrag wieder loeschen
      // damit kein verwaister Account uebrig bleibt.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return json({ success: false, error: `Employee-Anlage fehlgeschlagen: ${empErr.message}` }, 400);
    }

    return json({
      success: true,
      userId: newUserId,
      employeeId: empData?.id,
      pseudoEmail: !inputEmail,
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ein Fehler ist aufgetreten";
    console.error("create-employee-account error:", err);
    return json({ success: false, error: msg }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
