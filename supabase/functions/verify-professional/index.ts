import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RqeDetail = {
  rqe: string;
  especialidade: string | null;
};

type VerifyStatus = "verified" | "partial" | "pending_manual";

type VerifyResponse = {
  ok: boolean;
  found: boolean;
  regular?: boolean;
  verificationStatus: VerifyStatus;
  sourceUsed: string;
  consultedAt: string;
  doctor: {
    nome: string | null;
    crm: string | null;
    uf: string | null;
    situacao: string | null;
    tipoInscricao: string | null;
    dataInscricao?: string | null;
    instituicaoGraduacao?: string | null;
    anoGraduacao?: string | null;
    rqeList: string[];
    rqeDetails: RqeDetail[];
    fotoUrl: string | null;
    lattesUrl: string | null;
  };
  auditId?: string | null;
  error?: string;
  debug?: Record<string, unknown>;
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

function normalizeCrm(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\D/g, "").slice(0, 8);
}

function normalizeUf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

function normalizeRqeToken(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim().replace(/[^\d/A-Z]/gi, "").toUpperCase();
  const match = cleaned.match(/^(\d{1,8})(?:\/([A-Z]{2}))?$/);
  if (!match) return null;
  return match[2] ? `${match[1]}/${match[2]}` : match[1];
}

function normalizeRqeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const item of values) {
    const normalized = normalizeRqeToken(item);
    if (normalized) out.add(normalized);
  }
  return Array.from(out);
}

function normalizeRqeDetails(values: unknown): RqeDetail[] {
  if (!Array.isArray(values)) return [];
  const out = new Map<string, RqeDetail>();
  for (const raw of values) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const rqe = normalizeRqeToken(row.rqe);
    if (!rqe) continue;
    const especialidadeRaw = typeof row.especialidade === "string" ? row.especialidade.trim() : "";
    const especialidade = especialidadeRaw.length > 0 ? especialidadeRaw : null;
    const key = `${rqe}::${especialidade ?? ""}`;
    out.set(key, { rqe, especialidade });
  }
  return Array.from(out.values());
}

function deriveStatus(found: boolean, regular: boolean | undefined, rqeList: string[], rqeDetails: RqeDetail[]): VerifyStatus {
  const hasRqe = rqeList.length > 0 || rqeDetails.length > 0;
  if (!found) return "pending_manual";
  if (hasRqe && regular !== false) return "verified";
  if (hasRqe || regular === true) return "partial";
  return "pending_manual";
}

async function resolveTenantId(
  admin: ReturnType<typeof createClient>,
  requesterId: string,
  bodyTenantId: string | null,
): Promise<string | null> {
  if (bodyTenantId) return bodyTenantId;
  const { data, error } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", requesterId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return typeof data?.tenant_id === "string" ? data.tenant_id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, found: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, found: false, error: "Authorization header obrigatório" }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ ok: false, found: false, error: "Token inválido" }, 401);
    }

    const {
      data: { user: requester },
      error: requesterError,
    } = await admin.auth.getUser(token);
    if (requesterError || !requester) {
      return json({ ok: false, found: false, error: "Não autenticado" }, 401);
    }

    const body = await req.json();
    const crm = normalizeCrm(body.crm);
    const uf = normalizeUf(body.uf);
    const debug = Boolean(body.debug);
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : null;
    const bodyTenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : null;

    if (!crm || !uf) {
      return json({ ok: false, found: false, error: "crm e uf são obrigatórios" }, 400);
    }

    const lookupUrl = `${supabaseUrl.replace(/\/+$/g, "")}/functions/v1/lookup-cfm`;
    const lookupResponse = await fetch(lookupUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ crm, uf, debug }),
    });

    if (!lookupResponse.ok) {
      return json({
        ok: false,
        found: false,
        verificationStatus: "pending_manual",
        sourceUsed: "lookup-cfm-http-error",
        error: `lookup-cfm retornou ${lookupResponse.status}`,
      }, 502);
    }

    const lookupData = await lookupResponse.json();
    if (lookupData?.ok === false) {
      return json({
        ok: false,
        found: false,
        verificationStatus: "pending_manual",
        sourceUsed: typeof lookupData?.sourceUsed === "string" ? lookupData.sourceUsed : "lookup-cfm",
        error: typeof lookupData?.error === "string" ? lookupData.error : "Falha ao consultar o CFM",
      }, 502);
    }

    const found = Boolean(lookupData?.found);
    const regular = typeof lookupData?.regular === "boolean" ? lookupData.regular : undefined;
    const doctorRaw = (lookupData?.doctor ?? {}) as Record<string, unknown>;
    const rqeList = normalizeRqeList(doctorRaw.rqeList);
    const rqeDetails = normalizeRqeDetails(doctorRaw.rqeDetails);
    const verificationStatus = deriveStatus(found, regular, rqeList, rqeDetails);

    const payload: VerifyResponse = {
      ok: true,
      found,
      regular,
      verificationStatus,
      sourceUsed: "lookup-cfm",
      consultedAt: new Date().toISOString(),
      doctor: {
        nome: typeof doctorRaw.nome === "string" ? doctorRaw.nome : null,
        crm: typeof doctorRaw.crm === "string" ? doctorRaw.crm : crm,
        uf: typeof doctorRaw.uf === "string" ? doctorRaw.uf : uf,
        situacao: typeof doctorRaw.situacao === "string" ? doctorRaw.situacao : null,
        tipoInscricao: typeof doctorRaw.tipoInscricao === "string" ? doctorRaw.tipoInscricao : null,
        dataInscricao: typeof doctorRaw.dataInscricao === "string" ? doctorRaw.dataInscricao : null,
        instituicaoGraduacao: typeof doctorRaw.instituicaoGraduacao === "string" ? doctorRaw.instituicaoGraduacao : null,
        anoGraduacao: typeof doctorRaw.anoGraduacao === "string" ? doctorRaw.anoGraduacao : null,
        rqeList,
        rqeDetails,
        fotoUrl: typeof doctorRaw.fotoUrl === "string" ? doctorRaw.fotoUrl : null,
        lattesUrl: typeof doctorRaw.lattesUrl === "string" ? doctorRaw.lattesUrl : null,
      },
    };

    let auditId: string | null = null;
    let auditError: string | null = null;
    let metadataError: string | null = null;
    try {
      const tenantId = await resolveTenantId(admin, requester.id, bodyTenantId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
      const { data: inserted, error: insertError } = await admin
        .from("professional_registry_verifications")
        .insert({
          tenant_id: tenantId,
          user_id: targetUserId,
          requested_by: requester.id,
          crm,
          uf,
          verification_status: verificationStatus,
          source_used: payload.sourceUsed,
          regular: regular ?? null,
          found,
          normalized_payload: payload,
          raw_payload: lookupData,
          expires_at: expiresAt,
          error_message: lookupData?.error ? String(lookupData.error) : null,
        })
        .select("id")
        .single();

      if (insertError) {
        auditError = insertError.message;
      } else {
        auditId = inserted?.id ?? null;
      }
    } catch (err) {
      auditError = err instanceof Error ? err.message : String(err);
    }

    if (targetUserId) {
      try {
        const { data: authUserData, error: authFetchError } = await admin.auth.admin.getUserById(targetUserId);
        if (authFetchError) {
          metadataError = authFetchError.message;
        } else {
          const currentMetadata = (authUserData.user?.user_metadata ?? {}) as Record<string, unknown>;
          const nextMetadata: Record<string, unknown> = {
            ...currentMetadata,
            crm_last_verified_at: payload.consultedAt,
            crm_last_verification_status: verificationStatus,
            crm_last_verification_source: payload.sourceUsed,
            crm_last_regular: regular ?? null,
            crm_last_found: found,
            crm_last_crm: payload.doctor.crm ?? crm,
            crm_last_uf: payload.doctor.uf ?? uf,
            crm_last_situacao: payload.doctor.situacao ?? null,
            crm_last_audit_id: auditId,
          };
          const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetUserId, {
            user_metadata: nextMetadata,
          });
          if (authUpdateError) {
            metadataError = authUpdateError.message;
          }
        }
      } catch (err) {
        metadataError = err instanceof Error ? err.message : String(err);
      }
    }

    payload.auditId = auditId;
    if (debug) {
      payload.debug = {
        ...(typeof lookupData?.debug === "object" && lookupData.debug ? (lookupData.debug as Record<string, unknown>) : {}),
        auditError,
        metadataError,
      };
    }

    return json(payload);
  } catch (err) {
    return json({
      ok: false,
      found: false,
      verificationStatus: "pending_manual",
      sourceUsed: "verify-professional-error",
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
