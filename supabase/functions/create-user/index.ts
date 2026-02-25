import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function randomPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

Deno.serve(async (req) => {
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
      return json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Authorization header obrigatório" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requester },
      error: requesterError,
    } = await admin.auth.getUser(token);

    if (requesterError || !requester) {
      return json({ error: "Não autenticado" }, 401);
    }

    const body = await req.json();

    const tenantId = String(body.tenantId ?? "").trim();
    const email = normalizeText(body.email)?.toLowerCase();
    const name = normalizeText(body.name);
    const phone = normalizeText(body.phone);
    const requestedRole = String(body.role ?? "user").trim();
    const role = requestedRole === "admin" ? "admin" : "user";

    if (!tenantId || !email || !name) {
      return json({ error: "tenantId, email e name são obrigatórios" }, 400);
    }

    const { data: requesterMembership, error: requesterMembershipError } = await admin
      .from("memberships")
      .select("role, active")
      .eq("tenant_id", tenantId)
      .eq("user_id", requester.id)
      .eq("active", true)
      .maybeSingle();

    if (requesterMembershipError) {
      return json({ error: requesterMembershipError.message }, 400);
    }

    if (!requesterMembership || !["admin", "owner"].includes(requesterMembership.role)) {
      return json({ error: "Apenas admin/owner pode adicionar usuários" }, 403);
    }

    let targetUserId: string | null = null;
    let createdNow = false;
    let temporaryPassword: string | null = null;

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      targetUserId = existingProfile.id;
    }

    if (!targetUserId) {
      temporaryPassword = randomPassword(14);

      const { data: createdUserData, error: createUserError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          name,
        },
      });

      if (createUserError) {
        return json({ error: `Erro ao criar usuário: ${createUserError.message}` }, 400);
      }

      targetUserId = createdUserData.user?.id ?? null;
      createdNow = true;
    }

    if (!targetUserId) {
      return json({ error: "Não foi possível resolver o usuário" }, 500);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: targetUserId,
          name,
          full_name: name,
          email,
          phone,
          status: "ativo",
          updated_at: new Date().toISOString(),
          must_change_password: createdNow ? true : undefined,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      return json({ error: `Erro ao salvar perfil: ${profileError.message}` }, 400);
    }

    const { data: existingMembership, error: existingMembershipError } = await admin
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existingMembershipError) {
      return json({ error: existingMembershipError.message }, 400);
    }

    if (existingMembership?.id) {
      const { error: membershipUpdateError } = await admin
        .from("memberships")
        .update({ role, active: true, updated_by: requester.id, updated_at: new Date().toISOString() })
        .eq("id", existingMembership.id);

      if (membershipUpdateError) {
        return json({ error: membershipUpdateError.message }, 400);
      }

      return json({
        ok: true,
        userId: targetUserId,
        createdNow,
        membershipCreated: false,
        temporaryPassword,
      });
    }

    const { error: membershipInsertError } = await admin
      .from("memberships")
      .insert({
        tenant_id: tenantId,
        user_id: targetUserId,
        role,
        active: true,
        created_by: requester.id,
        updated_by: requester.id,
      });

    if (membershipInsertError) {
      return json({ error: membershipInsertError.message }, 400);
    }

    return json({
      ok: true,
      userId: targetUserId,
      createdNow,
      membershipCreated: true,
      temporaryPassword,
    });
  } catch (err) {
    return json(
      {
        error: "Erro inesperado",
        details: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
