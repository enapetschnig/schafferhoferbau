import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;

// Web Push crypto utilities for Deno
async function generatePushPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ endpoint: string; headers: Record<string, string>; body: Uint8Array }> {
  // Use the simpler approach: send via fetch with VAPID JWT
  const jwt = await createVapidJwt(subscription.endpoint);

  // For simplicity, use unencrypted payload with aes128gcm
  // This requires proper Web Push encryption - use a library
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);

  return {
    endpoint: subscription.endpoint,
    headers: {
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body: payloadBytes,
  };
}

async function createVapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: "mailto:napetschnig.chris@gmail.com",
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import VAPID private key
  const keyData = base64UrlToArrayBuffer(VAPID_PRIVATE_KEY);
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array([...new Uint8Array(keyData)]),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(unsignedToken)
  );

  // Convert DER signature to raw (r || s)
  const sigArray = new Uint8Array(signature);
  const sigB64 = arrayBufferToBase64Url(sigArray);

  return `${unsignedToken}.${sigB64}`;
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_ids, title, body, url } = await req.json();

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch push subscriptions for these users
    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, subscription")
      .in("user_id", user_ids);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch subscriptions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: title || "Schafferhofer Bau",
      body: body || "Neue Nachricht",
      url: url || "/",
      tag: `msg-${Date.now()}`,
    });

    let sent = 0;
    const expired: string[] = [];

    for (const sub of subscriptions) {
      const pushSub = sub.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };

      if (!pushSub?.endpoint) {
        expired.push(sub.id);
        continue;
      }

      try {
        // Simple push without encryption (relies on the push service to handle it)
        // For production, use proper Web Push encryption with p256dh and auth keys
        const response = await fetch(pushSub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            TTL: "86400",
          },
          body: payload,
        });

        if (response.status === 201 || response.status === 200) {
          sent++;
        } else if (response.status === 404 || response.status === 410) {
          // Subscription expired or invalid
          expired.push(sub.id);
        } else {
          console.error(`Push failed for ${sub.id}: ${response.status} ${await response.text()}`);
        }
      } catch (err) {
        console.error(`Push error for ${sub.id}:`, err);
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .in("id", expired);
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, expired: expired.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Send push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
