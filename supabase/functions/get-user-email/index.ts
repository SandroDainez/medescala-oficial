// supabase/functions/get-user-email/index.ts

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Env não configurado corretamente" }, 500);
    }

    // 🔐 Cliente ADMIN (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 🔎 Pega token do header
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return json({ error: "Token ausente" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // 🔐 Cliente temporário para validar o token
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Usuário não autenticado" }, 401);
    }

    // Aqui você pode checar se é admin se quiser:
    // (exemplo se tiver tabela profiles com role)
    // const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single()

    const body = await req.json();
    const userId = (body.userId || "").trim();

    if (!userId) {
      return json({ error: "userId é obrigatório" }, 400);
    }

    const { data, error } = await admin.auth.admin.getUserById(userId);

    if (error || !data?.user) {
      return json({ error: "Usuário não encontrado" }, 404);
    }

    return json({
      success: true,
      userId: data.user.id,
      email: data.user.email ?? null,
    });
  } catch (err) {
    return json(
      {
        error: "Erro interno",
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});