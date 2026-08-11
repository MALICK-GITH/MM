import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration Firebase
const FIREBASE_SERVER_KEY = Deno.env.get("FIREBASE_SERVER_KEY") || "";

serve(async (req) => {
  try {
    const { user_id, title, body, link, data } = await req.json();

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: "user_id et title sont requis" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Créer le client Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Récupérer les tokens push de l'utilisateur
    const { data: tokens, error: tokensError } = await supabase.rpc("get_user_push_tokens", {
      p_user_id: user_id,
    });

    if (tokensError) {
      console.error("Erreur récupération tokens:", tokensError);
      return new Response(
        JSON.stringify({ error: "Erreur récupération tokens" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun token push trouvé pour cet utilisateur" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Envoyer la notification à chaque token via FCM
    const fcmUrl = "https://fcm.googleapis.com/fcm/send";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `key=${FIREBASE_SERVER_KEY}`,
    };

    const notificationPayload = {
      notification: {
        title,
        body: body || "",
        icon: "/icon-192.png",
        badge: "/badge-72.png",
        click_action: link || "/",
      },
      data: data || {},
      registration_ids: tokens.map((t: any) => t.token),
    };

    const response = await fetch(fcmUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Erreur FCM:", result);
      return new Response(
        JSON.stringify({ error: "Erreur envoi notification FCM", details: result }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erreur Edge Function:", error);
    return new Response(
      JSON.stringify({ error: "Erreur interne" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
