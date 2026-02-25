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

async function deriveKey(keyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);

  return await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptValue(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decryptValue(ciphertext: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function safeDecrypt(value: unknown, key: CryptoKey): Promise<string | null> {
  if (!value) return null;

  try {
    return await decryptValue(String(value), key);
  } catch {
    return null;
  }
}

type UpdatePayload = {
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  status?: string;
  profileType?: string;
  cpf?: string;
  crm?: string;
  rqe?: string;
  rg?: string;
  address?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  pixType?: string;
  pixKey?: string;
};

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
    const PII_ENCRYPTION_KEY = Deno.env.get("PII_ENCRYPTION_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(
        {
          error: "Env não configurado",
          details: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes",
        },
        500,
      );
    }

    if (!PII_ENCRYPTION_KEY) {
      return json({ error: "PII_ENCRYPTION_KEY ausente" }, 500);
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

    const action = String(body.action ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();
    const userId = String(body.userId ?? "").trim();

    if (!action || !tenantId || !userId) {
      return json({ error: "action, tenantId e userId são obrigatórios" }, 400);
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
      return json({ error: "Apenas admin/owner pode gerenciar usuários" }, 403);
    }

    const { data: targetMembership, error: targetMembershipError } = await admin
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (targetMembershipError) {
      return json({ error: targetMembershipError.message }, 400);
    }

    if (!targetMembership) {
      return json({ error: "Usuário não pertence ao tenant informado" }, 404);
    }

    const cryptoKey = await deriveKey(PII_ENCRYPTION_KEY);

    if (action === "get") {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, name, full_name, email, phone, profile_type, status")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        return json({ error: profileError.message }, 400);
      }

      const { data: privateRow, error: privateError } = await admin
        .from("profiles_private")
        .select(
          "cpf_enc, crm_enc, rqe_enc, rg_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_type_enc, pix_key_enc",
        )
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (privateError) {
        return json({ error: privateError.message }, 400);
      }

      const privatePayload = {
        cpf: await safeDecrypt(privateRow?.cpf_enc, cryptoKey),
        crm: await safeDecrypt(privateRow?.crm_enc, cryptoKey),
        rqe: await safeDecrypt(privateRow?.rqe_enc, cryptoKey),
        rg: await safeDecrypt(privateRow?.rg_enc, cryptoKey),
        address: await safeDecrypt(privateRow?.address_enc, cryptoKey),
        bankName: await safeDecrypt(privateRow?.bank_name_enc, cryptoKey),
        bankAgency: await safeDecrypt(privateRow?.bank_agency_enc, cryptoKey),
        bankAccount: await safeDecrypt(privateRow?.bank_account_enc, cryptoKey),
        pixType: await safeDecrypt(privateRow?.pix_type_enc, cryptoKey),
        pixKey: await safeDecrypt(privateRow?.pix_key_enc, cryptoKey),
      };

      return json({ ok: true, profile, private: privatePayload });
    }

    if (action !== "update") {
      return json({ error: "action inválida" }, 400);
    }

    const payload = (body.payload ?? {}) as UpdatePayload;

    const profileUpdate = {
      name: normalizeText(payload.name),
      full_name: normalizeText(payload.fullName),
      email: normalizeText(payload.email),
      phone: normalizeText(payload.phone),
      status: normalizeText(payload.status) ?? "ativo",
      profile_type: normalizeText(payload.profileType),
      updated_at: new Date().toISOString(),
    };

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId);

    if (profileUpdateError) {
      return json({ error: profileUpdateError.message }, 400);
    }

    const authEmail = normalizeText(payload.email);
    if (authEmail) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
        email: authEmail,
        email_confirm: true,
      });

      if (authUpdateError) {
        return json({ error: `Erro ao atualizar email de login: ${authUpdateError.message}` }, 400);
      }
    }

    const privateUpsert: Record<string, string | null> = {
      cpf_enc: normalizeText(payload.cpf)
        ? await encryptValue(String(normalizeText(payload.cpf)), cryptoKey)
        : null,
      crm_enc: normalizeText(payload.crm)
        ? await encryptValue(String(normalizeText(payload.crm)), cryptoKey)
        : null,
      rqe_enc: normalizeText(payload.rqe)
        ? await encryptValue(String(normalizeText(payload.rqe)), cryptoKey)
        : null,
      rg_enc: normalizeText(payload.rg)
        ? await encryptValue(String(normalizeText(payload.rg)), cryptoKey)
        : null,
      address_enc: normalizeText(payload.address)
        ? await encryptValue(String(normalizeText(payload.address)), cryptoKey)
        : null,
      bank_name_enc: normalizeText(payload.bankName)
        ? await encryptValue(String(normalizeText(payload.bankName)), cryptoKey)
        : null,
      bank_agency_enc: normalizeText(payload.bankAgency)
        ? await encryptValue(String(normalizeText(payload.bankAgency)), cryptoKey)
        : null,
      bank_account_enc: normalizeText(payload.bankAccount)
        ? await encryptValue(String(normalizeText(payload.bankAccount)), cryptoKey)
        : null,
      pix_type_enc: normalizeText(payload.pixType)
        ? await encryptValue(String(normalizeText(payload.pixType)), cryptoKey)
        : null,
      pix_key_enc: normalizeText(payload.pixKey)
        ? await encryptValue(String(normalizeText(payload.pixKey)), cryptoKey)
        : null,
    };

    const { error: privateUpsertError } = await admin
      .from("profiles_private")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          last_updated_by: requester.id,
          updated_at: new Date().toISOString(),
          ...privateUpsert,
        },
        { onConflict: "user_id" },
      );

    if (privateUpsertError) {
      return json({ error: privateUpsertError.message }, 400);
    }

    return json({ ok: true });
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
