// supabase/functions/update-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(
        {
          error: "Env não configurado",
          details:
            "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes",
        },
        500
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = await req.json();
    console.log("BODY RECEBIDO:", body);

    const userId = (body.userId || "").trim();
    const name = (body.name || "").trim();

    if (!userId) {
      return json({ error: "userId é obrigatório" }, 400);
    }

    if (!name) {
      return json({ error: "name é obrigatório" }, 400);
    }

    // UPDATE direto e simples
    const { data, error } = await admin
      .from("profiles")
      .update({ name })
      .eq("id", userId)
      .select("id, name")
      .single();

    if (error) {
      console.error("ERRO UPDATE:", error);
      return json(
        {
          error: "Erro ao atualizar perfil",
          details: error.message,
        },
        400
      );
    }

    return json({
      ok: true,
      profile: data,
    });
  } catch (err) {
    console.error("ERRO INESPERADO:", err);
    return json(
      {
        error: "Erro inesperado",
        details:
          err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});