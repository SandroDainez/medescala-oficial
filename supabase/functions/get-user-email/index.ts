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

    const body = await req.json();
    const userId = String(body.userId ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();

    if (!userId) {
      return json({ error: "userId é obrigatório" }, 400);
    }

    // Isolamento entre tenants: consultar o e-mail de OUTRO usuário exige ser super admin,
    // ou admin/owner do tenant informado com o alvo membro desse tenant.
    if (userId !== user.id) {
      const { data: superAdmin } = await admin
        .from("super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (!superAdmin) {
        if (!tenantId) {
          return json({ error: "tenantId é obrigatório" }, 400);
        }
        const { data: requesterMembership } = await admin
          .from("memberships")
          .select("role")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();
        const { data: targetMembership } = await admin
          .from("memberships")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!requesterMembership || !["admin", "owner"].includes(requesterMembership.role) || !targetMembership) {
          return json({ error: "Sem permissão" }, 403);
        }
      }
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