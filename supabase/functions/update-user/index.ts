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

function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const normalized = hex.startsWith("\\x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) throw new Error("Invalid hex length");

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function utf8Decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

async function decryptCombined(combined: Uint8Array, key: CryptoKey): Promise<string> {
  if (combined.length <= 12) throw new Error("Ciphertext too short");
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
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

  // profiles_private columns are BYTEA, so we persist as PostgreSQL hex format.
  return `\\x${toHex(combined)}`;
}

async function decryptValue(ciphertext: string, key: CryptoKey): Promise<string> {
  // Current storage format (BYTEA hex): \x...
  if (ciphertext.startsWith("\\x")) {
    const bytes = fromHex(ciphertext);
    try {
      return await decryptCombined(bytes, key);
    } catch {
      // Legacy fallback: some rows may contain base64 text bytes inside BYTEA.
      const maybeBase64 = utf8Decode(bytes).trim();
      const legacyBytes = fromBase64(maybeBase64);
      return await decryptCombined(legacyBytes, key);
    }
  }

  // Legacy format kept for compatibility with previous versions.
  return await decryptCombined(fromBase64(ciphertext), key);
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
  accessRole?: "admin" | "user";
  cpf?: string;
  crm?: string;
  rqe?: string;
  rqeDetails?: Array<{ rqe?: string; especialidade?: string | null }>;
  cep?: string;
  rg?: string;
  address?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  pixType?: string;
  pixKey?: string;
  avatarUrl?: string;
  avatarPath?: string;
  curriculumUrl?: string;
  curriculumPath?: string;
  curriculumFileName?: string;
  lattesUrl?: string;
  lattesSummary?: string;
  lattesUpdatedAt?: string;
  avatarFileBase64?: string;
  avatarFileName?: string;
  avatarFileType?: string;
  curriculumFileBase64?: string;
  curriculumFileNameUpload?: string;
  curriculumFileType?: string;
  documents?: Array<{
    id?: string;
    kind?: string;
    fileName?: string;
    path?: string;
    url?: string;
    uploadedAt?: string;
    mimeType?: string;
  }>;
  documentUploads?: Array<{
    kind?: string;
    fileBase64?: string;
    fileName?: string;
    fileType?: string;
  }>;
};

type StoredDocument = {
  id: string;
  kind: string;
  fileName: string;
  path: string;
  url: string | null;
  uploadedAt: string;
  mimeType: string | null;
};

type RqeDetail = {
  rqe: string;
  especialidade: string | null;
};

function normalizeCep(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  if (!digits) return null;
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeRqeToken(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim().replace(/[^\d/A-Z]/gi, "").toUpperCase();
  const match = cleaned.match(/^(\d{1,8})(?:\/([A-Z]{2}))?$/);
  if (!match) return null;
  return match[2] ? `${match[1]}/${match[2]}` : match[1];
}

function normalizeRqeDetails(value: unknown): RqeDetail[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, RqeDetail>();
  for (const raw of value) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const rqe = normalizeRqeToken(row.rqe);
    if (!rqe) continue;
    const especialidadeRaw = typeof row.especialidade === "string" ? row.especialidade.trim() : "";
    const especialidade = especialidadeRaw.length > 0 ? especialidadeRaw : null;
    const key = `${rqe}::${especialidade ?? ""}`;
    unique.set(key, { rqe, especialidade });
  }
  return Array.from(unique.values());
}

function parseRqeDetailsFromText(value: string | null): RqeDetail[] {
  if (!value) return [];
  const entries = value
    .split(/[,\n;|]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed: RqeDetail[] = [];
  for (const entry of entries) {
    const parts = entry.split(/\s+-\s+/);
    const rqe = normalizeRqeToken(parts[0] ?? "");
    if (!rqe) continue;
    const especialidade = parts.slice(1).join(" - ").trim() || null;
    parsed.push({ rqe, especialidade });
  }
  return normalizeRqeDetails(parsed);
}

function formatRqeDetails(details: RqeDetail[]): string {
  return details
    .map((item) => (item.especialidade ? `${item.rqe} - ${item.especialidade}` : item.rqe))
    .join(", ");
}

const USER_ASSETS_BUCKET = "user-assets";

function normalizeBase64(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex >= 0 && trimmed.slice(0, commaIndex).includes("base64")) {
    return trimmed.slice(commaIndex + 1).trim();
  }
  return trimmed;
}

function toSafeFileName(input: string): string {
  const cleaned = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || `arquivo-${Date.now()}`;
}

function extFromType(contentType: string | null): string {
  if (!contentType) return "bin";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return map[contentType] ?? "bin";
}

function typeFromFileName(fileName: string | null): string | null {
  if (!fileName) return null;
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

async function ensureBucket(admin: ReturnType<typeof createClient>) {
  const { data: bucket } = await admin.storage.getBucket(USER_ASSETS_BUCKET);
  if (bucket) return;
  await admin.storage.createBucket(USER_ASSETS_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  });
}

async function uploadAsset(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  userId: string,
  kind: "avatar" | "curriculum" | "document",
  base64: string,
  contentType: string | null,
  fileNameRaw: string | null,
): Promise<{ path: string; signedUrl: string | null; fileName: string | null }> {
  const normalizedBase64 = normalizeBase64(base64);
  const bytes = Uint8Array.from(atob(normalizedBase64), (char) => char.charCodeAt(0));
  const normalizedType = normalizeText(contentType)?.toLowerCase() ?? null;
  const effectiveType =
    normalizedType && normalizedType !== "application/octet-stream"
      ? normalizedType
      : typeFromFileName(fileNameRaw);
  const extension = extFromType(effectiveType);
  const safeName = toSafeFileName(fileNameRaw ?? `${kind}.${extension}`);
  const path = `${tenantId}/${userId}/${kind}/${Date.now()}-${safeName}`;

  await ensureBucket(admin);
  const { error: uploadError } = await admin.storage
    .from(USER_ASSETS_BUCKET)
    .upload(path, bytes, {
      contentType: effectiveType ?? undefined,
      upsert: true,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: signedData } = await admin.storage
    .from(USER_ASSETS_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  return {
    path,
    signedUrl: signedData?.signedUrl ?? null,
    fileName: safeName,
  };
}

function normalizeDocumentKind(value: unknown): string {
  const raw = normalizeText(value)?.toLowerCase() ?? "outro";
  const allowed = new Set(["diploma", "crm", "rqe", "certificado", "curriculo", "outro"]);
  return allowed.has(raw) ? raw : "outro";
}

function normalizeStoredDocuments(value: unknown): StoredDocument[] {
  if (!Array.isArray(value)) return [];
  const out: StoredDocument[] = [];
  for (const rowRaw of value) {
    const row = (rowRaw ?? {}) as Record<string, unknown>;
    const path = normalizeText(row.path);
    const fileName = normalizeText(row.fileName);
    if (!path || !fileName) continue;
    out.push({
      id: normalizeText(row.id) ?? crypto.randomUUID(),
      kind: normalizeDocumentKind(row.kind),
      fileName,
      path,
      url: normalizeText(row.url),
      uploadedAt: normalizeText(row.uploadedAt) ?? new Date().toISOString(),
      mimeType: normalizeText(row.mimeType),
    });
  }
  return out;
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
    let userId = String(body.userId ?? "").trim();

    if (!action || !tenantId) {
      return json({ error: "action e tenantId são obrigatórios" }, 400);
    }

    const isSelfAction = action === "self_get" || action === "self_update";
    if (isSelfAction) {
      userId = requester.id;
    }

    if (!userId) {
      return json({ error: "userId é obrigatório para esta ação" }, 400);
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

    if (!requesterMembership) {
      return json({ error: "Usuário não pertence ao tenant informado" }, 403);
    }

    if (!isSelfAction && !["admin", "owner"].includes(requesterMembership.role)) {
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

    if (action === "get" || action === "self_get") {
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
        .maybeSingle();

      if (privateError) {
        return json({ error: privateError.message }, 400);
      }

      const decryptedRqe = await safeDecrypt(privateRow?.rqe_enc, cryptoKey);
      const privatePayload = {
        cpf: await safeDecrypt(privateRow?.cpf_enc, cryptoKey),
        crm: await safeDecrypt(privateRow?.crm_enc, cryptoKey),
        rqe: decryptedRqe,
        rg: await safeDecrypt(privateRow?.rg_enc, cryptoKey),
        cep: null as string | null,
        address: await safeDecrypt(privateRow?.address_enc, cryptoKey),
        bankName: await safeDecrypt(privateRow?.bank_name_enc, cryptoKey),
        bankAgency: await safeDecrypt(privateRow?.bank_agency_enc, cryptoKey),
        bankAccount: await safeDecrypt(privateRow?.bank_account_enc, cryptoKey),
        pixType: await safeDecrypt(privateRow?.pix_type_enc, cryptoKey),
        pixKey: await safeDecrypt(privateRow?.pix_key_enc, cryptoKey),
        rqeDetails: [] as RqeDetail[],
      };

      const { data: authUserData } = await admin.auth.admin.getUserById(userId);
      const metadata = (authUserData.user?.user_metadata ?? {}) as Record<string, unknown>;
      const metadataRqeDetails = normalizeRqeDetails(metadata.rqe_details);
      privatePayload.cep = normalizeCep(metadata.address_cep);
      privatePayload.rqeDetails = metadataRqeDetails.length > 0
        ? metadataRqeDetails
        : parseRqeDetailsFromText(decryptedRqe);
      if (privatePayload.rqeDetails.length > 0) {
        privatePayload.rqe = formatRqeDetails(privatePayload.rqeDetails);
      }
      const avatarPath = normalizeText(metadata.avatar_path);
      const curriculumPath = normalizeText(metadata.curriculum_path);
      const cep = normalizeCep(metadata.address_cep);

      let avatarUrl = normalizeText(metadata.avatar_url);
      let curriculumUrl = normalizeText(metadata.curriculum_url);

      if (avatarPath) {
        const { data: signedData } = await admin.storage
          .from(USER_ASSETS_BUCKET)
          .createSignedUrl(avatarPath, 60 * 60 * 24 * 7);
        avatarUrl = signedData?.signedUrl ?? avatarUrl;
      }

      if (curriculumPath) {
        const { data: signedData } = await admin.storage
          .from(USER_ASSETS_BUCKET)
          .createSignedUrl(curriculumPath, 60 * 60 * 24 * 7);
        curriculumUrl = signedData?.signedUrl ?? curriculumUrl;
      }

      const documentsStored = normalizeStoredDocuments(metadata.documents);
      const documents: StoredDocument[] = [];
      for (const doc of documentsStored) {
        let signedUrl = doc.url;
        if (doc.path) {
          const { data: signedData } = await admin.storage
            .from(USER_ASSETS_BUCKET)
            .createSignedUrl(doc.path, 60 * 60 * 24 * 7);
          signedUrl = signedData?.signedUrl ?? signedUrl;
        }
        documents.push({
          ...doc,
          url: signedUrl,
        });
      }

      return json({
        ok: true,
        profile,
        private: privatePayload,
        media: {
          avatarUrl,
          avatarPath,
          curriculumUrl,
          curriculumPath,
          curriculumFileName: normalizeText(metadata.curriculum_file_name),
          lattesUrl: normalizeText(metadata.lattes_url),
          lattesSummary: normalizeText(metadata.lattes_summary),
          lattesUpdatedAt: normalizeText(metadata.lattes_updated_at),
          crmLastVerifiedAt: normalizeText(metadata.crm_last_verified_at),
          crmLastVerificationStatus: normalizeText(metadata.crm_last_verification_status),
          crmLastVerificationSource: normalizeText(metadata.crm_last_verification_source),
          crmLastSituacao: normalizeText(metadata.crm_last_situacao),
          cep,
          documents,
        },
      });
    }

    if (action !== "update" && action !== "self_update") {
      return json({ error: "action inválida" }, 400);
    }

    const payload = (body.payload ?? {}) as UpdatePayload;

    const profileUpdate: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(payload, "name")) {
      profileUpdate.name = normalizeText(payload.name);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) {
      profileUpdate.full_name = normalizeText(payload.fullName);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "email")) {
      profileUpdate.email = normalizeText(payload.email);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
      profileUpdate.phone = normalizeText(payload.phone);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      profileUpdate.status = normalizeText(payload.status) ?? "ativo";
    }
    if (Object.prototype.hasOwnProperty.call(payload, "profileType")) {
      profileUpdate.profile_type = normalizeText(payload.profileType);
    }

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId);

    if (profileUpdateError) {
      return json({ error: profileUpdateError.message }, 400);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "accessRole")) {
      const nextRole = payload.accessRole === "admin" ? "admin" : "user";
      const { error: membershipRoleError } = await admin
        .from("memberships")
        .update({
          role: nextRole,
          updated_at: new Date().toISOString(),
          updated_by: requester.id,
        })
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (membershipRoleError) {
        return json({ error: `Erro ao atualizar acesso no membership: ${membershipRoleError.message}` }, 400);
      }
    }

    const { data: authUserData, error: authUserFetchError } = await admin.auth.admin.getUserById(userId);
    if (authUserFetchError) {
      return json({ error: `Erro ao obter metadados do usuário: ${authUserFetchError.message}` }, 400);
    }

    const currentUserMetadata = (authUserData.user?.user_metadata ?? {}) as Record<string, unknown>;
    const nextMetadata: Record<string, unknown> = { ...currentUserMetadata };
    const payloadRqeDetails = normalizeRqeDetails(payload.rqeDetails);
    const currentDocuments = normalizeStoredDocuments(nextMetadata.documents);
    const cep = normalizeCep(payload.cep);
    if (Object.prototype.hasOwnProperty.call(payload, "cep")) {
      if (cep === null) {
        delete nextMetadata.address_cep;
      } else {
        nextMetadata.address_cep = cep;
      }
    }

    if (payloadRqeDetails.length > 0) {
      nextMetadata.rqe_details = payloadRqeDetails;
    } else if (Object.prototype.hasOwnProperty.call(payload, "rqeDetails")) {
      delete nextMetadata.rqe_details;
    }

    const lattesUrl = normalizeText(payload.lattesUrl);
    if (lattesUrl === null) {
      delete nextMetadata.lattes_url;
    } else {
      nextMetadata.lattes_url = lattesUrl;
    }

    const lattesSummary = normalizeText(payload.lattesSummary);
    if (lattesSummary === null) {
      delete nextMetadata.lattes_summary;
    } else {
      nextMetadata.lattes_summary = lattesSummary;
    }

    const lattesUpdatedAt = normalizeText(payload.lattesUpdatedAt);
    if (lattesUpdatedAt === null) {
      delete nextMetadata.lattes_updated_at;
    } else {
      nextMetadata.lattes_updated_at = lattesUpdatedAt;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "avatarPath")) {
      const avatarPathInput = normalizeText(payload.avatarPath);
      if (avatarPathInput === null) {
        delete nextMetadata.avatar_path;
      } else {
        nextMetadata.avatar_path = avatarPathInput;
      }
    }

    const avatarUrlInput = normalizeText(payload.avatarUrl);
    if (avatarUrlInput === null) {
      delete nextMetadata.avatar_url;
    } else {
      nextMetadata.avatar_url = avatarUrlInput;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "curriculumPath")) {
      const curriculumPathInput = normalizeText(payload.curriculumPath);
      if (curriculumPathInput === null) {
        delete nextMetadata.curriculum_path;
      } else {
        nextMetadata.curriculum_path = curriculumPathInput;
      }
    }

    const curriculumUrlInput = normalizeText(payload.curriculumUrl);
    if (curriculumUrlInput === null) {
      delete nextMetadata.curriculum_url;
    } else {
      nextMetadata.curriculum_url = curriculumUrlInput;
    }

    const curriculumFileNameInput = normalizeText(payload.curriculumFileName);
    if (curriculumFileNameInput === null) {
      delete nextMetadata.curriculum_file_name;
    } else {
      nextMetadata.curriculum_file_name = curriculumFileNameInput;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "documents")) {
      nextMetadata.documents = normalizeStoredDocuments(payload.documents);
    }

    try {
      if (payload.avatarFileBase64) {
        const avatarUpload = await uploadAsset(
          admin,
          tenantId,
          userId,
          "avatar",
          payload.avatarFileBase64,
          normalizeText(payload.avatarFileType),
          normalizeText(payload.avatarFileName),
        );
        nextMetadata.avatar_path = avatarUpload.path;
        nextMetadata.avatar_url = avatarUpload.signedUrl;
      }

      if (payload.curriculumFileBase64) {
        const curriculumUpload = await uploadAsset(
          admin,
          tenantId,
          userId,
          "curriculum",
          payload.curriculumFileBase64,
          normalizeText(payload.curriculumFileType),
          normalizeText(payload.curriculumFileNameUpload),
        );
        nextMetadata.curriculum_path = curriculumUpload.path;
        nextMetadata.curriculum_url = curriculumUpload.signedUrl;
        nextMetadata.curriculum_file_name =
          curriculumUpload.fileName ?? normalizeText(payload.curriculumFileNameUpload);
      }

      const incomingDocs: StoredDocument[] = normalizeStoredDocuments(nextMetadata.documents);
      if (Array.isArray(payload.documentUploads) && payload.documentUploads.length > 0) {
        for (const itemRaw of payload.documentUploads) {
          const item = (itemRaw ?? {}) as Record<string, unknown>;
          const fileBase64 = normalizeText(item.fileBase64);
          if (!fileBase64) continue;
          const uploaded = await uploadAsset(
            admin,
            tenantId,
            userId,
            "document",
            fileBase64,
            normalizeText(item.fileType),
            normalizeText(item.fileName),
          );
          incomingDocs.push({
            id: crypto.randomUUID(),
            kind: normalizeDocumentKind(item.kind),
            fileName: uploaded.fileName ?? normalizeText(item.fileName) ?? "documento",
            path: uploaded.path,
            url: uploaded.signedUrl,
            uploadedAt: new Date().toISOString(),
            mimeType: normalizeText(item.fileType),
          });
        }
      }
      if (incomingDocs.length > 0) {
        nextMetadata.documents = incomingDocs;
      } else if (Object.prototype.hasOwnProperty.call(payload, "documents")) {
        nextMetadata.documents = [];
      } else if (currentDocuments.length > 0) {
        nextMetadata.documents = currentDocuments;
      } else {
        delete nextMetadata.documents;
      }
    } catch (assetError) {
      return json({
        error: `Falha ao fazer upload de arquivos: ${assetError instanceof Error ? assetError.message : String(assetError)}`,
      }, 400);
    }

    const authEmail = normalizeText(payload.email);
    const authUpdatePayload: {
      email?: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
    } = {
      user_metadata: nextMetadata,
    };

    if (authEmail) {
      authUpdatePayload.email = authEmail;
      authUpdatePayload.email_confirm = true;
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, authUpdatePayload);
    if (authUpdateError) {
      return json({ error: `Erro ao atualizar usuário no auth: ${authUpdateError.message}` }, 400);
    }

    const finalRqeText =
      payloadRqeDetails.length > 0
        ? formatRqeDetails(payloadRqeDetails)
        : (normalizeText(payload.rqe) ?? null);

    const privateUpsert: Record<string, string | null> = {
      cpf_enc: normalizeText(payload.cpf)
        ? await encryptValue(String(normalizeText(payload.cpf)), cryptoKey)
        : null,
      crm_enc: normalizeText(payload.crm)
        ? await encryptValue(String(normalizeText(payload.crm)), cryptoKey)
        : null,
      rqe_enc: finalRqeText
        ? await encryptValue(String(finalRqeText), cryptoKey)
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

    const { data: currentPrivateRow, error: currentPrivateError } = await admin
      .from("profiles_private")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (currentPrivateError) {
      return json({ error: currentPrivateError.message }, 400);
    }

    const { error: privateUpsertError } = await admin
      .from("profiles_private")
      .upsert(
        {
          user_id: userId,
          tenant_id: currentPrivateRow?.tenant_id ?? tenantId,
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
