import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveInvite(admin: ReturnType<typeof createClient>, inviteToken: string) {
  const tokenHash = await sha256Hex(inviteToken);

  const { data: invite, error: inviteError } = await admin
    .from("user_invites")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (inviteError) {
    return { error: inviteError.message, status: 400 as const, invite: null };
  }

  if (!invite?.id || !invite.user_id) {
    return {
      error: "Este convite é inválido, já foi usado ou foi substituído por um novo.",
      status: 400 as const,
      invite: null,
    };
  }

  if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
    return {
      error: "Este convite expirou. Solicite um novo link ao administrador.",
      status: 400 as const,
      invite: null,
    };
  }

  return { error: null, status: 200 as const, invite };
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

    const body = await req.json();
    const inviteToken = String(body.inviteToken ?? "").trim();
    const password = String(body.password ?? "");
    const validateOnly = body.validateOnly === true;

    if (!inviteToken) {
      return json({ error: "Token do convite é obrigatório" }, 400);
    }

    if (!validateOnly && password.length < 6) {
      return json({ error: "Senha deve ter no mínimo 6 caracteres" }, 400);
    }

    const resolvedInvite = await resolveInvite(admin, inviteToken);
    if (resolvedInvite.error || !resolvedInvite.invite) {
      return json({ error: resolvedInvite.error }, resolvedInvite.status);
    }
    const invite = resolvedInvite.invite;

    if (validateOnly) {
      return json({ ok: true });
    }

    const {
      data: existingUserData,
      error: existingUserError,
    } = await admin.auth.admin.getUserById(invite.user_id);

    if (existingUserError || !existingUserData.user) {
      return json({ error: "Usuário do convite não encontrado" }, 404);
    }

    const currentMetadata = (existingUserData.user.user_metadata ?? {}) as Record<string, unknown>;

    const { error: updateAuthError } = await admin.auth.admin.updateUserById(invite.user_id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...currentMetadata,
        must_change_password: false,
      },
    });

    if (updateAuthError) {
      return json({ error: updateAuthError.message }, 400);
    }

    const now = new Date().toISOString();

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        must_change_password: false,
        updated_at: now,
      })
      .eq("id", invite.user_id);

    if (profileError) {
      return json({ error: profileError.message }, 400);
    }

    const { error: inviteUpdateError } = await admin
      .from("user_invites")
      .update({
        used_at: now,
      })
      .eq("id", invite.id);

    if (inviteUpdateError) {
      return json({ error: inviteUpdateError.message }, 400);
    }

    return json({ ok: true });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
