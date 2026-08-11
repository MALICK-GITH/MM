import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { user_id, title, body, link, data } = await req.json();

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: "user_id et title sont requis" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Récupérer les tokens push de l'utilisateur
    const { data: tokens } = await supabase.rpc("get_user_push_tokens", {
      p_user_id: user_id,
    });

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun token push trouvé pour cet utilisateur" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Configuration Firebase FCM v1
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");

    if (!projectId || !clientEmail || !privateKey) {
      console.error("Variables Firebase manquantes");
      return new Response(
        JSON.stringify({ error: "Configuration Firebase manquante" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtenir un access token OAuth 2.0
    const accessToken = await getAccessToken(clientEmail, privateKey);

    // Envoyer via FCM v1 API
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const results = [];
    for (const token of tokens) {
      const payload = {
        message: {
          token: token.token,
          notification: {
            title,
            body: body || "",
          },
          data: data || {},
          webpush: {
            fcm_options: {
              link: link || "/",
            },
          },
        },
      };

      const response = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      results.push(result);

      if (!response.ok) {
        console.error("Erreur FCM pour token:", token.token, result);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erreur Edge Function:", error);
    return new Response(
      JSON.stringify({ error: "Erreur interne", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Fonction pour obtenir un access token OAuth 2.0 pour Firebase
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry,
  };

  // Encoder en base64url
  const base64UrlEncode = (str: string) => {
    return btoa(str)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Créer la signature JWT
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  // Utiliser Web Crypto API pour signer
  const privateKeyObj = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKeyObj,
    new TextEncoder().encode(signatureInput)
  );

  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  const jwt = `${signatureInput}.${encodedSignature}`;

  // Échanger le JWT contre un access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  
  if (tokenData.error) {
    throw new Error(`Erreur OAuth: ${tokenData.error}`);
  }

  return tokenData.access_token;
}

// Importer la clé privée PEM pour Web Crypto API
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Nettoyer la clé PEM
  const cleanKey = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(cleanKey), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}
