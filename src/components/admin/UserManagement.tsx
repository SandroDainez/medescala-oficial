"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { useUserDetails } from "@/hooks/useUserDetails";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";
import { adminFeedback } from "@/lib/adminFeedback";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RoleType = "admin" | "user" | "owner";
type AccessRole = "admin" | "user";
type ProfileTypeOption = "admin" | "plantonista" | "estudante" | "medico_estrangeiro" | "outro";
type RqeDetail = { rqe: string; especialidade: string };
type UserDocument = {
  id: string;
  kind: "diploma" | "crm" | "rqe" | "certificado" | "curriculo" | "outro";
  fileName: string;
  path: string;
  url: string;
  uploadedAt: string;
  mimeType: string;
};

type UserRow = {
  id: string;
  user_id: string;
  role: RoleType;
  active: boolean;
  created_at: string;
  tenant_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  name: string | null;
  profile_type: string | null;
  status: string | null;
};

type SectorRow = {
  id: string;
  name: string;
  active: boolean;
};

type MembershipWithProfile = {
  id: string;
  user_id: string;
  role: RoleType;
  active: boolean;
  created_at: string;
  tenant_id: string;
  profile: {
    email: string | null;
    full_name: string | null;
    phone: string | null;
    name: string | null;
    profile_type: string | null;
    status: string | null;
  } | null;
};

type PrivateProfilePayload = {
  cpf: string;
  crm: string;
  crmUf: string;
  rqe: string;
  rqeDetails: RqeDetail[];
  rg: string;
  cep: string;
  address: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  pixType: string;
  pixKey: string;
};

type UserMediaPayload = {
  avatarUrl: string;
  avatarPath: string;
  lattesUrl: string;
  lattesSummary: string;
  lattesUpdatedAt: string;
  curriculumUrl: string;
  curriculumPath: string;
  curriculumFileName: string;
  crmLastVerifiedAt: string;
  crmLastVerificationStatus: string;
  crmLastVerificationSource: string;
  crmLastSituacao: string;
  documents: UserDocument[];
};

type EditForm = {
  fullName: string;
  email: string;
  phone: string;
  profileType: string;
  status: string;
  accessRole: AccessRole;
} & PrivateProfilePayload & UserMediaPayload;

type CreateForm = EditForm;

type CfmLookupResult = {
  found: boolean;
  regular?: boolean;
  verificationStatus?: "verified" | "partial" | "pending_manual";
  sourceUsed?: string;
  consultedAt?: string;
  doctor?: {
    nome?: string | null;
    crm?: string | null;
    uf?: string | null;
    situacao?: string | null;
    tipoInscricao?: string | null;
    rqeList?: string[];
    rqeDetails?: Array<{ rqe: string; especialidade?: string | null }>;
    fotoUrl?: string | null;
    lattesUrl?: string | null;
  };
};

type ImportedProfessional = {
  line: number;
  nome: string;
  email: string;
  crm?: string;
  uf?: string;
  profileType: ProfileTypeOption;
  telefone: string;
};

type ImportIssue = {
  line: number;
  nome?: string;
  email?: string;
  error: string;
};

type ImportSummary = {
  created: number;
  skipped: number;
  failed: number;
};

const PROFILE_TYPE_OPTIONS: Array<{ value: ProfileTypeOption; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "plantonista", label: "Plantonista" },
  { value: "estudante", label: "Estudante" },
  { value: "medico_estrangeiro", label: "Médico Estrangeiro" },
  { value: "outro", label: "Outro" },
];

const EMPTY_PRIVATE: PrivateProfilePayload = {
  cpf: "",
  crm: "",
  crmUf: "SP",
  rqe: "",
  rqeDetails: [],
  rg: "",
  cep: "",
  address: "",
  bankName: "",
  bankAgency: "",
  bankAccount: "",
  pixType: "",
  pixKey: "",
};

const EMPTY_MEDIA: UserMediaPayload = {
  avatarUrl: "",
  avatarPath: "",
  lattesUrl: "",
  lattesSummary: "",
  lattesUpdatedAt: "",
  curriculumUrl: "",
  curriculumPath: "",
  curriculumFileName: "",
  crmLastVerifiedAt: "",
  crmLastVerificationStatus: "",
  crmLastVerificationSource: "",
  crmLastSituacao: "",
  documents: [],
};

const EMPTY_FORM: EditForm = {
  fullName: "",
  email: "",
  phone: "",
  profileType: "plantonista",
  status: "ativo",
  accessRole: "user",
  ...EMPTY_PRIVATE,
  ...EMPTY_MEDIA,
};

const EMPTY_CREATE_FORM: CreateForm = {
  ...EMPTY_FORM,
  accessRole: "user",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENFORCE_REGULAR_CRM = String(import.meta.env.VITE_ENFORCE_REGULAR_CRM ?? "false").toLowerCase() === "true";
const IMPORT_PREVIEW_LIMIT = 8;
const PROFILE_TYPES_WITH_OPTIONAL_CRM = new Set<ProfileTypeOption>(["estudante", "medico_estrangeiro", "outro"]);
const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

const DOCUMENT_KIND_OPTIONS: Array<{ value: UserDocument["kind"]; label: string }> = [
  { value: "diploma", label: "Diploma" },
  { value: "crm", label: "Documento CRM" },
  { value: "rqe", label: "Documento RQE" },
  { value: "certificado", label: "Certificado" },
  { value: "curriculo", label: "Currículo" },
  { value: "outro", label: "Outro" },
];

export default function UserManagement() {
  const { currentTenantId, currentTenantName, currentRole } = useTenant();
  const { toast } = useToast();
  const { updateUserSectors } = useUserDetails(currentTenantId ?? "");
  const canSendInvites = currentRole === "admin" || currentRole === "owner";
  const notifySuccess = useCallback(
    (action: string, description?: string) => adminFeedback.success(toast, action, description),
    [toast],
  );
  const notifyInfo = useCallback(
    (title: string, description?: string) => adminFeedback.info(toast, title, description),
    [toast],
  );
  const notifyWarning = useCallback(
    (title: string, description?: string) => adminFeedback.warning(toast, title, description),
    [toast],
  );
  const notifyError = useCallback(
    (action: string, error?: unknown, fallback?: string) => adminFeedback.error(toast, action, error, fallback),
    [toast],
  );

  const [users, setUsers] = useState<UserRow[]>([]);
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [sectorMemberships, setSectorMemberships] = useState<Array<{ user_id: string; sector_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [sectorDialogUser, setSectorDialogUser] = useState<UserRow | null>(null);
  const [sectorDialogSelection, setSectorDialogSelection] = useState<string[]>([]);
  const [savingSectors, setSavingSectors] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUser, setInviteUser] = useState<UserRow | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendingInviteEmail, setSendingInviteEmail] = useState(false);
  const [sendingInviteWhatsapp, setSendingInviteWhatsapp] = useState(false);
  const [editCfmLoading, setEditCfmLoading] = useState(false);
  const [createCfmLoading, setCreateCfmLoading] = useState(false);
  const [editCepLoading, setEditCepLoading] = useState(false);
  const [createCepLoading, setCreateCepLoading] = useState(false);
  const [editLattesLoading, setEditLattesLoading] = useState(false);
  const [createLattesLoading, setCreateLattesLoading] = useState(false);
  const [editCfmResult, setEditCfmResult] = useState<CfmLookupResult | null>(null);
  const [createCfmResult, setCreateCfmResult] = useState<CfmLookupResult | null>(null);
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const [editCurriculumFile, setEditCurriculumFile] = useState<File | null>(null);
  const [createCurriculumFile, setCreateCurriculumFile] = useState<File | null>(null);
  const [editDocumentFiles, setEditDocumentFiles] = useState<Array<{ file: File; kind: UserDocument["kind"] }>>([]);
  const [createDocumentFiles, setCreateDocumentFiles] = useState<Array<{ file: File; kind: UserDocument["kind"] }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const createAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const editCurriculumInputRef = useRef<HTMLInputElement | null>(null);
  const createCurriculumInputRef = useRef<HTMLInputElement | null>(null);
  const editDocumentsInputRef = useRef<HTMLInputElement | null>(null);
  const createDocumentsInputRef = useRef<HTMLInputElement | null>(null);
  const [editDocumentKind, setEditDocumentKind] = useState<UserDocument["kind"]>("outro");
  const [createDocumentKind, setCreateDocumentKind] = useState<UserDocument["kind"]>("outro");
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportedProfessional[]>([]);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleTab, setRoleTab] = useState<"all" | "admin" | "user">("all");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  async function fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  function isValidAvatarType(file: File): boolean {
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  }

  function isValidCurriculumType(file: File): boolean {
    return [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.type);
  }

  function isValidDocumentType(file: File): boolean {
    return [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(file.type);
  }

  function setAutoLattesAndPhoto(mode: "edit" | "create", result: CfmLookupResult) {
    const foto = String(result.doctor?.fotoUrl ?? "").trim();
    const lattes = String(result.doctor?.lattesUrl ?? "").trim();

    if (mode === "edit") {
      setForm((prev) => ({
        ...prev,
        avatarUrl: prev.avatarUrl || foto || "",
        lattesUrl: prev.lattesUrl || lattes || "",
      }));
      return;
    }

    setCreateForm((prev) => ({
      ...prev,
      avatarUrl: prev.avatarUrl || foto || "",
      lattesUrl: prev.lattesUrl || lattes || "",
    }));
  }

  async function lookupLattes(mode: "edit" | "create", sourceOverride?: string) {
    const source = sourceOverride ?? (mode === "edit" ? form.lattesUrl || form.crm : createForm.lattesUrl || createForm.crm);
    const value = String(source ?? "").trim();
    if (!value) {
      notifyWarning("Lattes não informado", "Informe URL/ID do Lattes ou um CRM para tentar localizar.");
      return;
    }

    if (mode === "edit") setEditLattesLoading(true);
    if (mode === "create") setCreateLattesLoading(true);

    let data: any = null;
    let error: any = null;
    try {
      const response = await supabase.functions.invoke("lookup-lattes", {
        body: { lattes: value },
      });
      data = response.data;
      error = response.error;
    } catch (invokeError) {
      error = invokeError;
    } finally {
      if (mode === "edit") setEditLattesLoading(false);
      if (mode === "create") setCreateLattesLoading(false);
    }

    if (error || !data?.ok) {
      notifyError("buscar Lattes", data?.error || error, "Não foi possível consultar o Lattes.");
      return;
    }

    const lattes = data?.lattes ?? {};
    const canonicalUrl = String(lattes.canonicalUrl ?? "").trim();
    const name = String(lattes.name ?? "").trim();
    const summary = String(lattes.summary ?? "").trim();
    const updatedAt = String(lattes.updatedAt ?? "").trim();

    if (mode === "edit") {
      setForm((prev) => ({
        ...prev,
        lattesUrl: canonicalUrl || prev.lattesUrl,
        lattesSummary: summary || prev.lattesSummary,
        lattesUpdatedAt: updatedAt || prev.lattesUpdatedAt,
        fullName: prev.fullName.trim() ? prev.fullName : name,
      }));
    } else {
      setCreateForm((prev) => ({
        ...prev,
        lattesUrl: canonicalUrl || prev.lattesUrl,
        lattesSummary: summary || prev.lattesSummary,
        lattesUpdatedAt: updatedAt || prev.lattesUpdatedAt,
        fullName: prev.fullName.trim() ? prev.fullName : name,
      }));
    }

    if (data?.found) {
      notifySuccess("Consulta Lattes", "Dados do Lattes carregados.");
    } else {
      notifyInfo("Lattes parcialmente localizado", data?.warning || "ID encontrado, sem detalhes no momento.");
    }
  }

  function canPersistByCfm(mode: "edit" | "create"): boolean {
    if (!ENFORCE_REGULAR_CRM) return true;

    const profileTypeRaw = mode === "edit" ? form.profileType : createForm.profileType;
    const profileType = (profileTypeRaw?.trim().toLowerCase() || "outro") as ProfileTypeOption;
    const crmOptionalForProfile = PROFILE_TYPES_WITH_OPTIONAL_CRM.has(profileType);
    if (crmOptionalForProfile) return true;

    const crmRaw = mode === "edit" ? form.crm : createForm.crm;
    const hasCrm = crmRaw.trim().length > 0;
    if (!hasCrm) return true;

    const loading = mode === "edit" ? editCfmLoading : createCfmLoading;
    const result = mode === "edit" ? editCfmResult : createCfmResult;

    if (loading) {
      notifyWarning("Consulta em andamento", "Aguarde a validação do CRM/CFM terminar.");
      return false;
    }

    if (!result) {
      notifyWarning("Validação obrigatória", "Consulte o CRM/CFM antes de salvar este usuário.");
      return false;
    }

    if (!result.found || result.regular === false) {
      notifyWarning("CRM não regular", "O usuário não pode ser salvo com CRM não regular.");
      return false;
    }

    return true;
  }

  const membershipsByUser = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const row of sectorMemberships) {
      const current = map.get(row.user_id) ?? [];
      current.push(row.sector_id);
      map.set(row.user_id, current);
    }

    return map;
  }, [sectorMemberships]);

  const sectorsById = useMemo(() => {
    const map = new Map<string, SectorRow>();
    for (const sector of sectors) {
      map.set(sector.id, sector);
    }
    return map;
  }, [sectors]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const base = users.filter((user) => {
      const isAdminRole = user.role === "admin" || user.role === "owner";
      if (roleTab === "admin" && !isAdminRole) return false;
      if (roleTab === "user" && isAdminRole) return false;
      if (!term) return true;
      const fields = [
        user.full_name ?? "",
        user.name ?? "",
        user.email ?? "",
        user.phone ?? "",
        user.profile_type ?? "",
        user.status ?? "",
      ];
      return fields.some((field) => field.toLowerCase().includes(term));
    });

    return base.slice().sort((a, b) => {
      const nameA = (a.full_name ?? a.name ?? a.email ?? "").trim().toLowerCase();
      const nameB = (b.full_name ?? b.name ?? b.email ?? "").trim().toLowerCase();
      return nameA.localeCompare(nameB, "pt-BR");
    });
  }, [users, searchTerm, roleTab]);

  const roleCounters = useMemo(() => {
    const admins = users.filter((u) => u.role === "admin" || u.role === "owner").length;
    const regularUsers = users.length - admins;
    return { admins, regularUsers, total: users.length };
  }, [users]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  }, [filteredUsers.length, pageSize]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize, currentTenantId, roleTab]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const loadData = useCallback(async () => {
    if (!currentTenantId) return;

    setLoading(true);

    const [usersRes, sectorsRes, membershipsRes] = await Promise.all([
      supabase
        .from("memberships")
        .select(
          "id, user_id, role, active, created_at, tenant_id, profile:profiles!memberships_user_id_profiles_fkey(email, full_name, phone, name, profile_type, status)"
        )
        .eq("tenant_id", currentTenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sectors")
        .select("id, name, active")
        .eq("tenant_id", currentTenantId)
        .order("name"),
      supabase
        .from("sector_memberships")
        .select("user_id, sector_id")
        .eq("tenant_id", currentTenantId),
    ]);

    if (usersRes.error) {
      notifyError("carregar usuários", usersRes.error, "Não foi possível carregar usuários.");
      setUsers([]);
    } else {
      const normalized = ((usersRes.data as MembershipWithProfile[] | null) ?? []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        role: row.role,
        active: row.active,
        created_at: row.created_at,
        tenant_id: row.tenant_id,
        email: row.profile?.email ?? null,
        full_name: row.profile?.full_name ?? null,
        phone: row.profile?.phone ?? null,
        name: row.profile?.name ?? null,
        profile_type: row.profile?.profile_type ?? null,
        status: row.profile?.status ?? null,
      }));

      setUsers(normalized);
    }

    if (sectorsRes.error) {
      notifyError("carregar setores", sectorsRes.error, "Não foi possível carregar setores.");
      setSectors([]);
    } else {
      setSectors((sectorsRes.data as SectorRow[]) ?? []);
    }

    if (membershipsRes.error) {
      notifyError("carregar vínculos de setores", membershipsRes.error, "Não foi possível carregar vínculos de setores.");
      setSectorMemberships([]);
    } else {
      setSectorMemberships(membershipsRes.data ?? []);
    }

    setLoading(false);
  }, [currentTenantId, notifyError]);

  useEffect(() => {
    if (!currentTenantId) return;
    loadData();
  }, [currentTenantId, loadData]);

  async function toggleActive(userId: string, current: boolean) {
    if (!currentTenantId) return;

    const { error } = await supabase
      .from("memberships")
      .update({ active: !current })
      .eq("user_id", userId)
      .eq("tenant_id", currentTenantId);

    if (error) {
      notifyError("atualizar status do usuário", error, "Não foi possível atualizar o status.");
      return;
    }

    await loadData();
  }

  async function deleteUser(user: UserRow) {
    if (!currentTenantId) return;
    if (!confirm(`Deseja excluir o usuário ${user.full_name ?? user.name ?? user.email ?? user.user_id}?`)) return;

    setDeletingUserId(user.user_id);

    const { data, error } = await supabase.functions.invoke("delete-users", {
      body: {
        tenantId: currentTenantId,
        userIds: [user.user_id],
      },
    });

    if (error || !data?.success) {
      notifyError("excluir usuário", data?.error || error, "Falha ao excluir usuário.");
      setDeletingUserId(null);
      return;
    }

    const errorList = Array.isArray(data?.errors) ? data.errors : [];
    if (errorList.length > 0) {
      notifyWarning("Usuário não excluído", String(errorList[0]));
    } else {
      notifySuccess("Exclusão de usuário");
    }

    setDeletingUserId(null);
    await loadData();
  }

  async function openUserModal(user: UserRow, readOnly: boolean) {
    if (!currentTenantId) return;

    setReadOnlyMode(readOnly);
    setEditingUser(user);
    setEditCfmResult(null);
    setEditAvatarFile(null);
    setEditCurriculumFile(null);
    setEditDocumentFiles([]);
    setEditDocumentKind("outro");
    setForm({
      ...EMPTY_FORM,
      fullName: user.full_name ?? user.name ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      profileType: user.profile_type ?? "plantonista",
      status: user.status ?? "ativo",
      accessRole: user.role === "admin" || user.role === "owner" ? "admin" : "user",
    });

    setEditOpen(true);

    const { data, error } = await supabase.functions.invoke("update-user", {
      body: {
        action: "get",
        tenantId: currentTenantId,
        userId: user.user_id,
      },
    });

    if (error || !data?.ok) {
      notifyError("carregar dados sensíveis", data?.error || error, "Verifique permissões de PII.");
      return;
    }

    const privateData = (data.private ?? {}) as Partial<PrivateProfilePayload> & { rqeDetails?: unknown };
    const mediaData = (data.media ?? {}) as Partial<UserMediaPayload>;
    const parsedCrm = parseCrm(privateData.crm ?? "");

    const normalizedRqeDetails = normalizeRqeDetails(privateData.rqeDetails);
    const parsedFromText = parseRqeDetailsFromText(privateData.rqe ?? "");
    const mergedRqeDetails = normalizedRqeDetails.length > 0 ? normalizedRqeDetails : parsedFromText;

    setForm((prev) => ({
      ...prev,
      cpf: privateData.cpf ?? "",
      crm: parsedCrm.crm || (privateData.crm ?? ""),
      crmUf: parsedCrm.uf || prev.crmUf || "SP",
      rqe: mergedRqeDetails.length > 0 ? formatRqeDetails(mergedRqeDetails) : (privateData.rqe ?? ""),
      rqeDetails: mergedRqeDetails,
      rg: privateData.rg ?? "",
      cep: privateData.cep ?? "",
      address: privateData.address ?? "",
      bankName: privateData.bankName ?? "",
      bankAgency: privateData.bankAgency ?? "",
      bankAccount: privateData.bankAccount ?? "",
      pixType: privateData.pixType ?? "",
      pixKey: privateData.pixKey ?? "",
      avatarUrl: mediaData.avatarUrl ?? "",
      avatarPath: mediaData.avatarPath ?? "",
      lattesUrl: mediaData.lattesUrl ?? "",
      lattesSummary: mediaData.lattesSummary ?? "",
      lattesUpdatedAt: mediaData.lattesUpdatedAt ?? "",
      curriculumUrl: mediaData.curriculumUrl ?? "",
      curriculumPath: mediaData.curriculumPath ?? "",
      curriculumFileName: mediaData.curriculumFileName ?? "",
      documents: normalizeDocuments(mediaData.documents),
      crmLastVerifiedAt: mediaData.crmLastVerifiedAt ?? "",
      crmLastVerificationStatus: mediaData.crmLastVerificationStatus ?? "",
      crmLastVerificationSource: mediaData.crmLastVerificationSource ?? "",
      crmLastSituacao: mediaData.crmLastSituacao ?? "",
    }));
  }

  function openSectorDialog(user: UserRow) {
    const current = membershipsByUser.get(user.user_id) ?? [];
    setSectorDialogUser(user);
    setSectorDialogSelection(current);
    setSectorDialogOpen(true);
  }

  async function saveSectorDialog() {
    if (!sectorDialogUser) return;

    setSavingSectors(true);

    const previous = membershipsByUser.get(sectorDialogUser.user_id) ?? [];
    await updateUserSectors(sectorDialogUser.user_id, previous, sectorDialogSelection);

    notifySuccess("Atualização de setores");

    setSavingSectors(false);
    setSectorDialogOpen(false);
    setSectorDialogUser(null);
    await loadData();
  }

  function toggleSectorSelection(sectorId: string, checked: boolean) {
    if (checked) {
      setSectorDialogSelection((prev) => (prev.includes(sectorId) ? prev : [...prev, sectorId]));
      return;
    }
    setSectorDialogSelection((prev) => prev.filter((id) => id !== sectorId));
  }

  async function openEdit(user: UserRow) {
    await openUserModal(user, false);
  }

  async function openView(user: UserRow) {
    await openUserModal(user, true);
  }

  async function saveUser() {
    if (!currentTenantId || !editingUser) return;
    if (!canPersistByCfm("edit")) return;

    setSaving(true);
    let avatarFileBase64: string | undefined;
    let curriculumFileBase64: string | undefined;
    let documentUploads:
      | Array<{ kind: UserDocument["kind"]; fileBase64: string; fileName: string; fileType: string }>
      | undefined;
    try {
      if (editAvatarFile) {
        avatarFileBase64 = await fileToBase64(editAvatarFile);
      }
      if (editCurriculumFile) {
        curriculumFileBase64 = await fileToBase64(editCurriculumFile);
      }
      if (editDocumentFiles.length > 0) {
        documentUploads = await Promise.all(
          editDocumentFiles.map(async ({ file, kind }) => ({
            kind,
            fileBase64: await fileToBase64(file),
            fileName: file.name,
            fileType: file.type,
          })),
        );
      }
    } catch (fileError) {
      notifyError("processar arquivos", fileError, "Não foi possível processar os arquivos selecionados.");
      setSaving(false);
      return;
    }

    const effectiveProfileType = form.accessRole === "admin" ? "admin" : form.profileType;
    const { data, error } = await supabase.functions.invoke("update-user", {
      body: {
        action: "update",
        tenantId: currentTenantId,
        userId: editingUser.user_id,
        payload: {
          name: form.fullName,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          profileType: effectiveProfileType,
          accessRole: form.accessRole,
          status: form.status,
          cpf: form.cpf,
          crm: formatCrmWithUf(form.crm, form.crmUf),
          rqe: form.rqeDetails.length > 0 ? formatRqeDetails(form.rqeDetails) : form.rqe,
          rqeDetails: form.rqeDetails,
          rg: form.rg,
          cep: form.cep,
          address: form.address,
          bankName: form.bankName,
          bankAgency: form.bankAgency,
          bankAccount: form.bankAccount,
          pixType: form.pixType,
          pixKey: form.pixKey,
          avatarUrl: form.avatarUrl || null,
          avatarPath: form.avatarPath || null,
          curriculumUrl: form.curriculumUrl || null,
          curriculumPath: form.curriculumPath || null,
          curriculumFileName: form.curriculumFileName || null,
          documents: form.documents,
          lattesUrl: form.lattesUrl || null,
          lattesSummary: form.lattesSummary || null,
          lattesUpdatedAt: form.lattesUpdatedAt || null,
          avatarFileBase64,
          avatarFileName: editAvatarFile?.name,
          avatarFileType: editAvatarFile?.type,
          curriculumFileBase64,
          curriculumFileNameUpload: editCurriculumFile?.name,
          curriculumFileType: editCurriculumFile?.type,
          documentUploads,
        },
      },
    });

    if (error || !data?.ok) {
      notifyError("salvar usuário", data?.error || error, "Não foi possível salvar o usuário.");
      setSaving(false);
      return;
    }

    notifySuccess(
      "Atualização de usuário",
      editAvatarFile || editDocumentFiles.length > 0
        ? "Dados salvos com sucesso."
        : undefined,
    );

    setEditOpen(false);
    setEditingUser(null);
    setEditDocumentFiles([]);
    setSaving(false);

    await loadData();
  }

  async function createUser() {
    if (!currentTenantId) return;
    if (!canPersistByCfm("create")) return;

    const name = createForm.fullName.trim();
    const email = createForm.email.trim().toLowerCase();

    if (!name || !email) {
      notifyWarning("Campos obrigatórios", "Nome e email são obrigatórios.");
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      notifyWarning("Email inválido", "Informe um email válido para enviar o convite.");
      return;
    }

    setCreating(true);
    let avatarFileBase64: string | undefined;
    let curriculumFileBase64: string | undefined;
    let documentUploads:
      | Array<{ kind: UserDocument["kind"]; fileBase64: string; fileName: string; fileType: string }>
      | undefined;
    try {
      if (createAvatarFile) {
        avatarFileBase64 = await fileToBase64(createAvatarFile);
      }
      if (createCurriculumFile) {
        curriculumFileBase64 = await fileToBase64(createCurriculumFile);
      }
      if (createDocumentFiles.length > 0) {
        documentUploads = await Promise.all(
          createDocumentFiles.map(async ({ file, kind }) => ({
            kind,
            fileBase64: await fileToBase64(file),
            fileName: file.name,
            fileType: file.type,
          })),
        );
      }
    } catch (fileError) {
      notifyError("processar arquivos", fileError, "Não foi possível processar os arquivos selecionados.");
      setCreating(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        tenantId: currentTenantId,
        name,
        email,
        phone: createForm.phone.trim(),
        role: createForm.accessRole,
      },
    });

    if (error || !data?.ok || !data?.userId) {
      notifyError("adicionar usuário", data?.error || error, "Não foi possível adicionar o usuário.");
      setCreating(false);
      return;
    }

    const createdUserId = String(data.userId);

    const effectiveProfileType = createForm.accessRole === "admin" ? "admin" : createForm.profileType;
    const { data: detailsData, error: detailsError } = await supabase.functions.invoke("update-user", {
      body: {
        action: "update",
        tenantId: currentTenantId,
        userId: createdUserId,
        payload: {
          name,
          fullName: createForm.fullName || name,
          email: createForm.email,
          phone: createForm.phone,
          profileType: effectiveProfileType,
          accessRole: createForm.accessRole,
          status: createForm.status,
          cpf: createForm.cpf,
          crm: formatCrmWithUf(createForm.crm, createForm.crmUf),
          rqe: createForm.rqeDetails.length > 0 ? formatRqeDetails(createForm.rqeDetails) : createForm.rqe,
          rqeDetails: createForm.rqeDetails,
          rg: createForm.rg,
          cep: createForm.cep,
          address: createForm.address,
          bankName: createForm.bankName,
          bankAgency: createForm.bankAgency,
          bankAccount: createForm.bankAccount,
          pixType: createForm.pixType,
          pixKey: createForm.pixKey,
          avatarUrl: createForm.avatarUrl || null,
          avatarPath: createForm.avatarPath || null,
          curriculumUrl: createForm.curriculumUrl || null,
          curriculumPath: createForm.curriculumPath || null,
          curriculumFileName: createForm.curriculumFileName || null,
          documents: createForm.documents,
          lattesUrl: createForm.lattesUrl || null,
          lattesSummary: createForm.lattesSummary || null,
          lattesUpdatedAt: createForm.lattesUpdatedAt || null,
          avatarFileBase64,
          avatarFileName: createAvatarFile?.name,
          avatarFileType: createAvatarFile?.type,
          curriculumFileBase64,
          curriculumFileNameUpload: createCurriculumFile?.name,
          curriculumFileType: createCurriculumFile?.type,
          documentUploads,
        },
      },
    });

    if (detailsError || !detailsData?.ok) {
      notifyWarning(
        "Usuário criado com pendências",
        detailsData?.error || detailsError?.message || "Abra editar e complete os dados.",
      );
    }

    const loginUrl = buildPublicAppUrl("/auth");
    const redirectUrl = buildPublicAppUrl("/reset-password");
    const inviteName = name;
    const { data: inviteData, error: inviteError } = await supabase.functions.invoke("send-invite-email", {
      body: {
        name: inviteName,
        email,
        hospitalName: currentTenantName || "MedEscala",
        loginUrl,
        redirectUrl,
        tenantId: currentTenantId,
      },
    });

    if (inviteError || inviteData?.error) {
      notifyWarning(
        "Usuário criado sem convite",
        inviteData?.error || inviteError?.message || "Você pode enviar manualmente na ação Convite.",
      );
    } else {
      notifySuccess(
        "Cadastro de usuário",
        createAvatarFile
          ? "Foto salva com sucesso e convite enviado por email automaticamente."
          : "Convite enviado por email automaticamente.",
      );
    }

    setCreateForm(EMPTY_CREATE_FORM);
    setCreateAvatarFile(null);
    setCreateCurriculumFile(null);
    setCreateDocumentFiles([]);
    setCreateOpen(false);
    setCreating(false);
    await loadData();
  }

  function buildInviteText(user: UserRow, resetLink?: string) {
    const loginUrl = buildPublicAppUrl("/auth");
    const hospitalName = currentTenantName || "MedEscala";
    const displayName = user.full_name || user.name || "Profissional";

    if (!resetLink?.trim()) {
      return `Olá, ${displayName}!\n\nGere um novo link de convite antes de copiar ou enviar esta mensagem.\n\nDepois do envio, o link correto aparecerá aqui.`;
    }

    const resetUrl = resetLink.trim();

    return `Olá, ${displayName}!\n\nVocê foi convidado para o ${hospitalName} no app MedEscala.\nEmail: ${user.email || "-"}\n\nPrimeiro acesso:\n1) Defina sua senha: ${resetUrl}\n2) Depois faça login: ${loginUrl}`;
  }

  function normalizeWhatsappPhone(rawPhone: string | null | undefined) {
    if (!rawPhone) return null;

    let digits = rawPhone.replace(/\D/g, "");
    if (!digits) return null;

    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    }

    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
      digits = `55${digits}`;
    }

    if (digits.length < 12 || digits.length > 15) {
      return null;
    }

    return digits;
  }

  function openInviteDialog(user: UserRow) {
    if (!canSendInvites) {
      notifyWarning("Sem permissão", "Apenas administradores podem enviar convites.");
      return;
    }
    setInviteUser(user);
    setInviteMessage(buildInviteText(user, ""));
    setInviteOpen(true);
  }

  async function lookupCfm(mode: "edit" | "create") {
    const sourceCrm = mode === "edit" ? form.crm : createForm.crm;
    const normalized = sourceCrm.trim().toUpperCase();
    const match = normalized.match(/(\d{3,8})\s*\/?\s*([A-Z]{2})?/);
    const crm = match?.[1] ?? "";
    const ufFromForm = mode === "edit" ? form.crmUf : createForm.crmUf;
    const uf = (String(ufFromForm || match?.[2] || "").trim().toUpperCase().slice(0, 2));

    if (!crm) {
      notifyWarning("CRM inválido", "Informe um CRM válido para consultar no CFM.");
      return;
    }

    if (mode === "edit") setEditCfmLoading(true);
    if (mode === "create") setCreateCfmLoading(true);

    let data: any = null;
    let error: any = null;
    try {
      const response = await supabase.functions.invoke("verify-professional", {
        body: {
          crm,
          uf,
          tenantId: currentTenantId ?? null,
          userId: mode === "edit" ? editingUser?.user_id ?? null : null,
        },
      });
      data = response.data;
      error = response.error;
    } catch (invokeError) {
      error = invokeError;
    } finally {
      if (mode === "edit") setEditCfmLoading(false);
      if (mode === "create") setCreateCfmLoading(false);
    }

    if (error || !data?.ok) {
      notifyError("consultar CFM", data?.error || error, "Não foi possível validar o CRM agora.");
      return;
    }

    const result = {
      found: Boolean(data?.found),
      regular: typeof data?.regular === "boolean" ? data.regular : undefined,
      verificationStatus: typeof data?.verificationStatus === "string" ? data.verificationStatus : undefined,
      sourceUsed: typeof data?.sourceUsed === "string" ? data.sourceUsed : undefined,
      consultedAt: typeof data?.consultedAt === "string" ? data.consultedAt : undefined,
      doctor: data?.doctor ?? undefined,
    } as CfmLookupResult;

    const apiRqeList = Array.isArray(result.doctor?.rqeList)
      ? result.doctor?.rqeList
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0)
      : [];
    const apiRqeDetails = Array.isArray(result.doctor?.rqeDetails)
      ? result.doctor.rqeDetails
          .map((item) => ({
            rqe: normalizeRqeValue(String(item?.rqe ?? "").trim()),
            especialidade: String(item?.especialidade ?? "").trim(),
          }))
          .filter((item) => item.rqe.length > 0)
      : [];
    const normalizedApiRqeDetails = normalizeRqeDetails(apiRqeDetails);
    const formattedRqeDetails = apiRqeDetails.map((item) =>
      item.especialidade ? `${item.rqe} - ${item.especialidade}` : item.rqe,
    );
    const mergedApiRqe = Array.from(new Set([...apiRqeList, ...formattedRqeDetails]));

    const mergeRqe = (current: string, list: string[]) => {
      const currentParts = current
        .split(/[;,|]/g)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const merged = Array.from(new Set([...currentParts, ...list]));
      return merged.join(", ");
    };

    if (mode === "edit") {
      setEditCfmResult(result);
      if (result.found) {
        setAutoLattesAndPhoto("edit", result);
        setForm((prev) => ({
          ...prev,
          rqeDetails: normalizeRqeDetails([...prev.rqeDetails, ...normalizedApiRqeDetails]),
          fullName: prev.fullName.trim() ? prev.fullName : String(result.doctor?.nome ?? "").trim(),
          rqe:
            mergedApiRqe.length > 0
              ? mergeRqe(prev.rqe, mergedApiRqe)
              : formatRqeDetails(normalizeRqeDetails([...prev.rqeDetails, ...normalizedApiRqeDetails])),
          crmLastVerifiedAt: result.consultedAt ?? prev.crmLastVerifiedAt,
          crmLastVerificationStatus: result.verificationStatus ?? prev.crmLastVerificationStatus,
          crmLastVerificationSource: result.sourceUsed ?? prev.crmLastVerificationSource,
          crmLastSituacao: String(result.doctor?.situacao ?? prev.crmLastSituacao ?? ""),
        }));
        const autoLattesUrl = String(result.doctor?.lattesUrl ?? "").trim();
        if (autoLattesUrl) {
          await lookupLattes("edit", autoLattesUrl);
        }
      }
    }

    if (mode === "create") {
      setCreateCfmResult(result);
      if (result.found) {
        setAutoLattesAndPhoto("create", result);
        setCreateForm((prev) => ({
          ...prev,
          rqeDetails: normalizeRqeDetails([...prev.rqeDetails, ...normalizedApiRqeDetails]),
          fullName: prev.fullName.trim() ? prev.fullName : String(result.doctor?.nome ?? "").trim(),
          rqe:
            mergedApiRqe.length > 0
              ? mergeRqe(prev.rqe, mergedApiRqe)
              : formatRqeDetails(normalizeRqeDetails([...prev.rqeDetails, ...normalizedApiRqeDetails])),
          crmLastVerifiedAt: result.consultedAt ?? prev.crmLastVerifiedAt,
          crmLastVerificationStatus: result.verificationStatus ?? prev.crmLastVerificationStatus,
          crmLastVerificationSource: result.sourceUsed ?? prev.crmLastVerificationSource,
          crmLastSituacao: String(result.doctor?.situacao ?? prev.crmLastSituacao ?? ""),
        }));
        const autoLattesUrl = String(result.doctor?.lattesUrl ?? "").trim();
        if (autoLattesUrl) {
          await lookupLattes("create", autoLattesUrl);
        }
      }
    }
  }

  async function sendInviteByEmail() {
    if (!currentTenantId) return;
    if (!canSendInvites) {
      notifyWarning("Sem permissão", "Apenas administradores podem enviar convites.");
      return;
    }

    if (!inviteUser?.email) {
      notifyWarning("Usuário sem email", "Preencha o email do usuário antes de enviar convite.");
      return;
    }

    setSendingInviteEmail(true);

    const loginUrl = buildPublicAppUrl("/auth");
    const redirectUrl = buildPublicAppUrl("/reset-password");
    const { data, error } = await supabase.functions.invoke("send-invite-email", {
      body: {
        name: inviteUser.full_name || inviteUser.name || "Profissional",
        email: inviteUser.email,
        hospitalName: currentTenantName || "MedEscala",
        loginUrl,
        redirectUrl,
        tenantId: currentTenantId,
        sendEmail: true,
      },
    });

    setSendingInviteEmail(false);

    if (error || data?.error) {
      notifyError("enviar convite por email", data?.error || error, "Falha no envio do convite.");
      return;
    }

    if (inviteUser && typeof data?.resetLink === "string" && data.resetLink.trim()) {
      setInviteMessage(buildInviteText(inviteUser, data.resetLink));
    }

    notifySuccess("Envio de convite por email");
  }

  async function sendInviteByWhatsapp() {
    if (!currentTenantId) return;
    const phone = normalizeWhatsappPhone(inviteUser?.phone);
    if (!phone) {
      notifyWarning("Telefone inválido", "Preencha um telefone válido do usuário (com DDD) para enviar via WhatsApp.");
      return;
    }

    if (!inviteUser?.email) {
      notifyWarning("Usuário sem email", "Preencha o email do usuário antes de enviar convite por WhatsApp.");
      return;
    }

    setSendingInviteWhatsapp(true);

    const loginUrl = buildPublicAppUrl("/auth");
    const redirectUrl = buildPublicAppUrl("/reset-password");
    const { data, error } = await supabase.functions.invoke("send-invite-email", {
      body: {
        name: inviteUser.full_name || inviteUser.name || "Profissional",
        email: inviteUser.email,
        hospitalName: currentTenantName || "MedEscala",
        loginUrl,
        redirectUrl,
        tenantId: currentTenantId,
        sendEmail: false,
      },
    });

    setSendingInviteWhatsapp(false);

    if (error || data?.error || !data?.resetLink) {
      notifyError("gerar link de convite", data?.error || error, "Falha ao gerar o link de convite para WhatsApp.");
      return;
    }

    const resetLink = String(data.resetLink).trim();
    if (!resetLink.includes("invite_token=")) {
      notifyError("gerar link de convite", "Link retornado sem invite_token", "O convite não foi enviado porque o link gerado está incompleto.");
      return;
    }

    const message = buildInviteText(inviteUser, resetLink);
    setInviteMessage(message);

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${phone}?text=${encoded}`, "_blank", "noopener,noreferrer");
    notifySuccess("Link de convite aberto no WhatsApp");
  }

  function normalizeHeader(value: unknown) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseCrm(rawCrm: string) {
    const normalized = rawCrm.trim().toUpperCase();
    const match = normalized.match(/(\d{3,8})\s*\/?\s*([A-Z]{2})?/);
    return {
      crm: match?.[1] ?? "",
      uf: match?.[2] ?? "",
    };
  }

  function formatCrmWithUf(crmRaw: string, ufRaw: string) {
    const crm = String(crmRaw ?? "").replace(/\D/g, "").trim();
    const uf = String(ufRaw ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    if (!crm) return "";
    return uf ? `${crm}/${uf}` : crm;
  }

  function normalizeCep(value: string) {
    const digits = String(value ?? "").replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  async function lookupCep(mode: "edit" | "create") {
    const currentCep = mode === "edit" ? form.cep : createForm.cep;
    const cepDigits = String(currentCep ?? "").replace(/\D/g, "").slice(0, 8);
    if (cepDigits.length !== 8) {
      notifyWarning("CEP inválido", "Informe um CEP com 8 dígitos.");
      return;
    }

    if (mode === "edit") setEditCepLoading(true);
    if (mode === "create") setCreateCepLoading(true);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      if (!response.ok) {
        notifyError("buscar CEP", `Status ${response.status}`, "Falha ao consultar CEP.");
        return;
      }
      const data = await response.json() as Record<string, unknown>;
      if (data.erro === true) {
        notifyWarning("CEP não encontrado", "Verifique o CEP informado.");
        return;
      }
      const logradouro = String(data.logradouro ?? "").trim();
      const bairro = String(data.bairro ?? "").trim();
      const localidade = String(data.localidade ?? "").trim();
      const uf = String(data.uf ?? "").trim().toUpperCase();
      const numeroHint = "s/n";
      const composedAddress = [logradouro, numeroHint, bairro, [localidade, uf].filter(Boolean).join(" - ")]
        .filter(Boolean)
        .join(", ");
      const normalized = normalizeCep(cepDigits);

      if (mode === "edit") {
        setForm((prev) => ({
          ...prev,
          cep: normalized,
          address: composedAddress || prev.address,
        }));
      } else {
        setCreateForm((prev) => ({
          ...prev,
          cep: normalized,
          address: composedAddress || prev.address,
        }));
      }
      notifySuccess("CEP preenchido");
    } catch (err) {
      notifyError("buscar CEP", err, "Não foi possível consultar o CEP agora.");
    } finally {
      if (mode === "edit") setEditCepLoading(false);
      if (mode === "create") setCreateCepLoading(false);
    }
  }

  function normalizeRqeValue(value: string) {
    return String(value ?? "").replace(/[^\d/A-Z/]/gi, "").toUpperCase().trim();
  }

  function normalizeRqeDetails(value: unknown): RqeDetail[] {
    if (!Array.isArray(value)) return [];
    const unique = new Map<string, RqeDetail>();
    for (const raw of value) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const rqe = normalizeRqeValue(String(item.rqe ?? ""));
      if (!rqe) continue;
      const especialidade = String(item.especialidade ?? "").trim();
      const key = `${rqe}::${especialidade}`;
      unique.set(key, { rqe, especialidade });
    }
    return Array.from(unique.values());
  }

  function parseRqeDetailsFromText(text: string): RqeDetail[] {
    const entries = String(text ?? "")
      .split(/[,\n;|]+/g)
      .map((part) => part.trim())
      .filter(Boolean);
    const details: RqeDetail[] = [];
    for (const entry of entries) {
      const parts = entry.split(/\s+-\s+/);
      const rqe = normalizeRqeValue(parts[0] ?? "");
      if (!rqe) continue;
      const especialidade = parts.slice(1).join(" - ").trim();
      details.push({ rqe, especialidade });
    }
    return normalizeRqeDetails(details);
  }

  function formatRqeDetails(details: RqeDetail[]): string {
    return details
      .map((item) => (item.especialidade ? `${item.rqe} - ${item.especialidade}` : item.rqe))
      .join(", ");
  }

  function normalizeDocuments(value: unknown): UserDocument[] {
    if (!Array.isArray(value)) return [];
    const docs: UserDocument[] = [];
    for (const rowRaw of value) {
      const row = (rowRaw ?? {}) as Record<string, unknown>;
      const path = String(row.path ?? "").trim();
      const fileName = String(row.fileName ?? "").trim();
      if (!path || !fileName) continue;
      const kindRaw = String(row.kind ?? "outro").trim().toLowerCase() as UserDocument["kind"];
      const kind = DOCUMENT_KIND_OPTIONS.some((opt) => opt.value === kindRaw) ? kindRaw : "outro";
      docs.push({
        id: String(row.id ?? crypto.randomUUID()),
        kind,
        fileName,
        path,
        url: String(row.url ?? "").trim(),
        uploadedAt: String(row.uploadedAt ?? "").trim(),
        mimeType: String(row.mimeType ?? "").trim(),
      });
    }
    return docs;
  }

  function formatDateTime(value: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("pt-BR");
  }

  async function handleImportFile(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

      if (!firstSheet) {
        notifyWarning("Planilha inválida", "Não foi encontrada nenhuma aba no arquivo.");
        return;
      }

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });

      let headerLineIndex = -1;
      let nomeIndex = -1;
      let emailIndex = -1;
      let crmIndex = -1;
      let telefoneIndex = -1;
      let celularIndex = -1;

      for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
        const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
        const normalizedRow = row.map((cell) => normalizeHeader(cell));

        const localNomeIndex = normalizedRow.findIndex((cell) => cell === "nome");
        const localEmailIndex = normalizedRow.findIndex((cell) => cell === "email");
        const localCrmIndex = normalizedRow.findIndex((cell) => cell === "reg prof" || cell === "reg prof.");

        if (localNomeIndex >= 0 && localEmailIndex >= 0) {
          headerLineIndex = rowIndex;
          nomeIndex = localNomeIndex;
          emailIndex = localEmailIndex;
          crmIndex = localCrmIndex;
          telefoneIndex = normalizedRow.findIndex((cell) => cell === "telefone");
          celularIndex = normalizedRow.findIndex((cell) => cell === "celular");
          break;
        }
      }

      if (headerLineIndex < 0) {
        notifyWarning("Cabeçalho não encontrado", "A planilha deve ter as colunas Nome e Email. Reg. Prof. é opcional.");
        return;
      }

      const rows: ImportedProfessional[] = [];
      const issues: ImportIssue[] = [];
      const seenEmails = new Set<string>();

      for (let rowIndex = headerLineIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
        const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
        const line = rowIndex + 1;

        const nome = String(row[nomeIndex] ?? "").trim();
        const email = String(row[emailIndex] ?? "").trim().toLowerCase();
        const crmRaw = crmIndex >= 0 ? String(row[crmIndex] ?? "").trim() : "";
        const telefone = String(
          (celularIndex >= 0 ? row[celularIndex] : "") || (telefoneIndex >= 0 ? row[telefoneIndex] : "") || ""
        ).trim();

        if (!nome && !email && !crmRaw) {
          continue;
        }

        if (!nome || !email) {
          issues.push({ line, nome, email, error: "Nome e email são obrigatórios." });
          continue;
        }

        if (!EMAIL_REGEX.test(email)) {
          issues.push({ line, nome, email, error: "Email inválido." });
          continue;
        }

        if (seenEmails.has(email)) {
          issues.push({ line, nome, email, error: "Email duplicado na planilha." });
          continue;
        }

        seenEmails.add(email);

        const crmData = parseCrm(crmRaw);
        const crmNormalized = crmRaw.trim();
        const hasCrm = crmNormalized.length > 0;

        rows.push({
          line,
          nome,
          email,
          crm: hasCrm ? (crmData.crm || crmNormalized) : "",
          uf: hasCrm ? crmData.uf : "",
          profileType: hasCrm ? "plantonista" : "estudante",
          telefone,
        });
      }

      setImportRows(rows);
      setImportIssues(issues);
      setImportFileName(file.name);
      setImportSummary(null);
      setImportOpen(true);

      notifyInfo("Planilha carregada", `${rows.length} válido(s), ${issues.length} com problema.`);
    } catch (error) {
      notifyError("ler planilha", error, "Não foi possível processar o arquivo.");
    }
  }

  async function importProfessionals() {
    if (!currentTenantId) return;
    if (importRows.length === 0) {
      notifyWarning("Nada para importar", "Selecione uma planilha com linhas válidas.");
      return;
    }

    setImporting(true);
    setImportSummary(null);

    const runtimeIssues: ImportIssue[] = [];
    const existingEmails = new Set(
      users
        .map((user) => String(user.email ?? "").trim().toLowerCase())
        .filter((email) => email.length > 0)
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of importRows) {
      if (existingEmails.has(item.email)) {
        skipped += 1;
        runtimeIssues.push({
          line: item.line,
          nome: item.nome,
          email: item.email,
          error: "Email já cadastrado no sistema.",
        });
        continue;
      }

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          tenantId: currentTenantId,
          name: item.nome,
          email: item.email,
          phone: item.telefone,
          role: "user",
        },
      });

      if (error || !data?.ok || !data?.userId) {
        failed += 1;
        runtimeIssues.push({
          line: item.line,
          nome: item.nome,
          email: item.email,
          error: data?.error || error?.message || "Falha ao criar usuário.",
        });
        continue;
      }

      const crmWithUf = item.crm ? (item.uf ? `${item.crm}/${item.uf}` : item.crm) : "";
      const { data: detailsData, error: detailsError } = await supabase.functions.invoke("update-user", {
        body: {
          action: "update",
          tenantId: currentTenantId,
          userId: String(data.userId),
          payload: {
            name: item.nome,
            fullName: item.nome,
            email: item.email,
            phone: item.telefone,
            profileType: item.profileType,
            status: "ativo",
            crm: crmWithUf || undefined,
          },
        },
      });

      if (detailsError || !detailsData?.ok) {
        failed += 1;
        runtimeIssues.push({
          line: item.line,
          nome: item.nome,
          email: item.email,
          error: detailsData?.error || detailsError?.message || "Usuário criado, mas dados complementares não foram salvos.",
        });
        continue;
      }

      created += 1;
      existingEmails.add(item.email);
    }

    const mergedIssues = [...importIssues, ...runtimeIssues];
    setImportIssues(mergedIssues);
    setImportSummary({ created, skipped, failed });
    setImporting(false);

    notifyInfo("Importação concluída", `Criados: ${created} | Ignorados: ${skipped} | Falhas: ${failed}`);

    await loadData();
  }

  return (
    <div className="admin-page p-6">
      <div className="page-header mb-0 flex items-center justify-between">
        <h1 className="page-title text-2xl">Gestão de Usuários</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await handleImportFile(file);
              e.currentTarget.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Importar planilha
          </Button>
          <Button
            onClick={() => {
              setCreateCfmResult(null);
              setCreateAvatarFile(null);
              setCreateCurriculumFile(null);
              setCreateDocumentFiles([]);
              setCreateDocumentKind("outro");
              setCreateForm(EMPTY_CREATE_FORM);
              setCreateOpen(true);
            }}
          >
            Adicionar usuário
          </Button>
        </div>
      </div>

      <div className="admin-surface mt-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={roleTab === "all" ? "default" : "outline"}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => setRoleTab("all")}
          >
            Todos ({roleCounters.total})
          </Button>
          <Button
            type="button"
            variant={roleTab === "admin" ? "default" : "outline"}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => setRoleTab("admin")}
          >
            Administradores ({roleCounters.admins})
          </Button>
          <Button
            type="button"
            variant={roleTab === "user" ? "default" : "outline"}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => setRoleTab("user")}
          >
            Usuários ({roleCounters.regularUsers})
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, email, telefone, tipo ou status"
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Itens por página</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-9 w-[92px] rounded-lg px-2.5 py-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/70 p-2">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground md:text-right">
            Exibindo {paginatedUsers.length} de {filteredUsers.length} usuário(s)
          </div>
        </div>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <div className="space-y-3">
          {paginatedUsers.length === 0 ? (
            <div className="admin-surface p-6 text-center text-sm text-muted-foreground">
              Nenhum usuário encontrado para a busca atual.
            </div>
          ) : (
            paginatedUsers.map((u) => (
            <div
              key={u.id}
              className="admin-surface p-4 transition-colors hover:bg-muted/20"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground lg:text-base">
                    {u.full_name ?? u.name ?? "-"}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground lg:text-sm">{u.email ?? "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      u.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      u.role === "admin" || u.role === "owner"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {u.role === "admin" || u.role === "owner" ? "admin" : "usuário"}
                  </span>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">
                    {u.profile_type ?? "outro"}
                  </span>
                </div>
              </div>

              <div className="mb-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <p><span className="font-medium text-foreground">Telefone:</span> {u.phone ?? "-"}</p>
                <p><span className="font-medium text-foreground">Setores:</span> {(membershipsByUser.get(u.user_id) ?? []).length}</p>
                <div className="flex justify-start md:justify-end">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    variant="outline"
                    onClick={() => openSectorDialog(u)}
                  >
                    Selecionar setores
                  </Button>
                </div>
              </div>

              <div className={`grid gap-2 ${canSendInvites ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4"}`}>
                {canSendInvites && (
                  <Button size="sm" className="h-8 text-xs" variant="outline" onClick={() => openInviteDialog(u)}>
                    Convite
                  </Button>
                )}
                <Button size="sm" className="h-8 text-xs" variant="secondary" onClick={() => openView(u)}>
                  Visualizar
                </Button>
                <Button size="sm" className="h-8 text-xs" variant="outline" onClick={() => openEdit(u)}>
                  Editar
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={() => toggleActive(u.user_id, u.active)}>
                  {u.active ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-8 text-xs text-destructive ${canSendInvites ? "" : "col-span-2 lg:col-span-1"}`}
                  disabled={deletingUserId === u.user_id}
                  onClick={() => deleteUser(u)}
                >
                  {deletingUserId === u.user_id ? "Excluindo..." : "Excluir"}
                </Button>
              </div>
            </div>
            ))
          )}

          <div className="admin-surface flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Próxima
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{readOnlyMode ? "Dados do usuário" : "Editar usuário"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Informações Básicas</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input disabled={readOnlyMode} value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input disabled={readOnlyMode} type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input disabled={readOnlyMode} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    disabled={readOnlyMode}
                    value={form.status}
                    onValueChange={(value) => setForm((p) => ({ ...p, status: value }))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/70 p-2">
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Tipo</Label>
                  <Select
                    disabled={readOnlyMode}
                    value={form.profileType || "outro"}
                    onValueChange={(value) => setForm((p) => ({ ...p, profileType: value }))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/70 p-2">
                      {PROFILE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Acesso</Label>
                  <Select
                    disabled={readOnlyMode}
                    value={form.accessRole}
                    onValueChange={(value) =>
                      setForm((p) => {
                        const nextAccess = value as AccessRole;
                        return {
                          ...p,
                          accessRole: nextAccess,
                          profileType: nextAccess === "admin" ? "admin" : p.profileType,
                        };
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/70 p-2">
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <Label>Foto do usuário (opcional)</Label>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
                    <Avatar className="h-16 w-16 rounded-xl">
                      <AvatarImage src={form.avatarUrl || undefined} alt={form.fullName || "Usuário"} />
                      <AvatarFallback className="rounded-xl text-sm font-semibold">
                        {(form.fullName || "U")
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() ?? "")
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      ref={editAvatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (!isValidAvatarType(file)) {
                          notifyWarning("Formato inválido", "Use JPG, PNG ou WEBP para a foto.");
                          return;
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          notifyWarning("Arquivo grande", "A foto deve ter no máximo 5MB.");
                          return;
                        }
                        setEditAvatarFile(file);
                        setForm((prev) => ({ ...prev, avatarUrl: URL.createObjectURL(file), avatarPath: "" }));
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={readOnlyMode}
                        onClick={() => editAvatarInputRef.current?.click()}
                      >
                        {form.avatarUrl ? "Trocar foto" : "Selecionar foto"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={readOnlyMode || !form.avatarUrl}
                        onClick={() => {
                          setEditAvatarFile(null);
                          setForm((prev) => ({ ...prev, avatarUrl: "", avatarPath: "" }));
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Informações Profissionais</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input disabled={readOnlyMode} value={form.cpf} onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>RG</Label>
                  <Input disabled={readOnlyMode} value={form.rg} onChange={(e) => setForm((p) => ({ ...p, rg: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>CEP</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={readOnlyMode || editCepLoading}
                      onClick={() => lookupCep("edit")}
                    >
                      {editCepLoading ? "Buscando..." : "Buscar CEP"}
                    </Button>
                  </div>
                  <Input
                    disabled={readOnlyMode}
                    value={form.cep}
                    onChange={(e) => setForm((p) => ({ ...p, cep: normalizeCep(e.target.value) }))}
                    placeholder="00000-000"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>CRM</Label>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-8 px-2 text-[11px] border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => lookupCfm("edit")}
                      disabled={editCfmLoading}
                    >
                      {editCfmLoading ? "Consultando..." : "Consultar CRM/CFM"}
                    </Button>
                  </div>
                  {PROFILE_TYPES_WITH_OPTIONAL_CRM.has((form.profileType || "outro") as ProfileTypeOption) && (
                    <p className="text-xs text-muted-foreground">
                      CRM opcional para este tipo de usuário.
                    </p>
                  )}
                  <Input
                    disabled={readOnlyMode}
                    value={form.crm}
                    onChange={(e) => {
                      setEditCfmResult(null);
                      setForm((p) => ({ ...p, crm: e.target.value }));
                    }}
                  />
                  <div className="space-y-2">
                    <Label>UF CRM</Label>
                    <Select
                      disabled={readOnlyMode}
                      value={form.crmUf}
                      onValueChange={(value) => setForm((p) => ({ ...p, crmUf: value }))}
                    >
                      <SelectTrigger className="h-10 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/70 p-2">
                        {UF_OPTIONS.map((ufOption) => (
                          <SelectItem key={`edit-uf-${ufOption}`} value={ufOption}>
                            {ufOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editCfmResult && (
                    <div className={`mt-2 rounded-md border p-2 text-xs ${editCfmResult.found ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {editCfmResult.found ? (
                        <>
                          <p className="font-semibold">{editCfmResult.doctor?.nome ?? "Médico localizado"}</p>
                          <p>CRM: {editCfmResult.doctor?.crm ?? "-"} / {editCfmResult.doctor?.uf ?? "-"}</p>
                          <p>Situação: {editCfmResult.doctor?.situacao ?? (editCfmResult.regular ? "Regular" : "Não regular")}</p>
                          {(editCfmResult.verificationStatus || editCfmResult.sourceUsed || editCfmResult.consultedAt) && (
                            <p>
                              Verificação: {editCfmResult.verificationStatus ?? "-"} | Fonte: {editCfmResult.sourceUsed ?? "-"} | Data/hora: {formatDateTime(editCfmResult.consultedAt ?? "") || "-"}
                            </p>
                          )}
                          {Array.isArray(editCfmResult.doctor?.rqeList) && editCfmResult.doctor.rqeList.length > 0 && (
                            <p>RQE(s): {editCfmResult.doctor.rqeList.join(", ")}</p>
                          )}
                          {Array.isArray(editCfmResult.doctor?.rqeDetails) && editCfmResult.doctor.rqeDetails.length > 0 && (
                            <p>
                              RQE + Especialidade:{" "}
                              {editCfmResult.doctor.rqeDetails
                                .map((item) => (item.especialidade ? `${item.rqe} - ${item.especialidade}` : item.rqe))
                                .join(", ")}
                            </p>
                          )}
                        </>
                      ) : (
                        <p>Nenhum registro encontrado no CFM para este CRM.</p>
                      )}
                    </div>
                  )}
                  {!editCfmResult && form.crmLastVerifiedAt && (
                    <div className="mt-2 rounded-md border border-muted bg-muted/40 p-2 text-xs text-muted-foreground">
                      Última verificação: {formatDateTime(form.crmLastVerifiedAt)} | Status: {form.crmLastVerificationStatus || "-"} | Fonte: {form.crmLastVerificationSource || "-"} | Situação: {form.crmLastSituacao || "-"}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>RQEs e Especialidades</Label>
                    {!readOnlyMode && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            rqeDetails: [...prev.rqeDetails, { rqe: "", especialidade: "" }],
                          }))
                        }
                      >
                        Adicionar RQE
                      </Button>
                    )}
                  </div>
                  {form.rqeDetails.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum RQE cadastrado.</p>
                  )}
                  <div className="space-y-2">
                    {form.rqeDetails.map((item, index) => (
                      <div key={`edit-rqe-${index}`} className="grid grid-cols-12 gap-2">
                        <Input
                          disabled={readOnlyMode}
                          className="col-span-4"
                          placeholder="RQE"
                          value={item.rqe}
                          onChange={(e) =>
                            setForm((prev) => {
                              const next = [...prev.rqeDetails];
                              next[index] = { ...next[index], rqe: normalizeRqeValue(e.target.value) };
                              const normalized = normalizeRqeDetails(next);
                              return { ...prev, rqeDetails: normalized, rqe: formatRqeDetails(normalized) };
                            })
                          }
                        />
                        <Input
                          disabled={readOnlyMode}
                          className="col-span-6"
                          placeholder="Especialidade"
                          value={item.especialidade}
                          onChange={(e) =>
                            setForm((prev) => {
                              const next = [...prev.rqeDetails];
                              next[index] = { ...next[index], especialidade: e.target.value };
                              const normalized = normalizeRqeDetails(next);
                              return { ...prev, rqeDetails: normalized, rqe: formatRqeDetails(normalized) };
                            })
                          }
                        />
                        {!readOnlyMode && (
                          <Button
                            type="button"
                            variant="outline"
                            className="col-span-2"
                            onClick={() =>
                              setForm((prev) => {
                                const next = prev.rqeDetails.filter((_, i) => i !== index);
                                return { ...prev, rqeDetails: next, rqe: formatRqeDetails(next) };
                              })
                            }
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Input
                    disabled={readOnlyMode}
                    value={form.rqe}
                    placeholder="Resumo textual dos RQEs"
                    onChange={(e) =>
                      setForm((prev) => {
                        const raw = e.target.value;
                        const parsed = parseRqeDetailsFromText(raw);
                        return { ...prev, rqe: raw, rqeDetails: parsed.length > 0 ? parsed : prev.rqeDetails };
                      })
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Endereço</Label>
                  <Input disabled={readOnlyMode} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Currículo / Lattes (opcional)</Label>
                  <input
                    ref={editCurriculumInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (!isValidCurriculumType(file)) {
                        notifyWarning("Formato inválido", "Use PDF, DOC ou DOCX para o currículo.");
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        notifyWarning("Arquivo grande", "O currículo deve ter no máximo 10MB.");
                        return;
                      }
                      setEditCurriculumFile(file);
                      setForm((prev) => ({
                        ...prev,
                        curriculumFileName: file.name,
                        curriculumUrl: "",
                        curriculumPath: "",
                      }));
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={readOnlyMode}
                      onClick={() => editCurriculumInputRef.current?.click()}
                    >
                      {form.curriculumFileName ? "Trocar currículo" : "Importar currículo"}
                    </Button>
                    {form.curriculumUrl && (
                      <a href={form.curriculumUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        Visualizar arquivo atual
                      </a>
                    )}
                    {form.curriculumFileName && <span className="text-xs text-muted-foreground">{form.curriculumFileName}</span>}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={readOnlyMode || (!form.curriculumFileName && !form.curriculumUrl)}
                      onClick={() => {
                        setEditCurriculumFile(null);
                        setForm((prev) => ({
                          ...prev,
                          curriculumFileName: "",
                          curriculumUrl: "",
                          curriculumPath: "",
                        }));
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Documentos (diploma, CRM, certificados e outros)</Label>
                  <input
                    ref={editDocumentsInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length === 0) return;
                      const valid: Array<{ file: File; kind: UserDocument["kind"] }> = [];
                      for (const file of files) {
                        if (!isValidDocumentType(file)) {
                          notifyWarning("Formato inválido", `O arquivo "${file.name}" não é suportado.`);
                          continue;
                        }
                        if (file.size > 10 * 1024 * 1024) {
                          notifyWarning("Arquivo grande", `O arquivo "${file.name}" deve ter no máximo 10MB.`);
                          continue;
                        }
                        valid.push({ file, kind: editDocumentKind });
                      }
                      if (valid.length > 0) {
                        setEditDocumentFiles((prev) => [...prev, ...valid]);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={editDocumentKind}
                        disabled={readOnlyMode}
                        onValueChange={(value) => setEditDocumentKind(value as UserDocument["kind"])}
                      >
                        <SelectTrigger className="h-10 w-full rounded-xl md:w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/70 p-2">
                          {DOCUMENT_KIND_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" disabled={readOnlyMode} onClick={() => editDocumentsInputRef.current?.click()}>
                        Adicionar documento
                      </Button>
                    </div>
                    {form.documents.length === 0 && editDocumentFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p>
                    )}
                    {form.documents.map((doc, index) => (
                      <div key={`${doc.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOCUMENT_KIND_OPTIONS.find((item) => item.value === doc.kind)?.label || "Outro"}
                            {doc.uploadedAt ? ` • ${formatDateTime(doc.uploadedAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.url ? (
                            <a href={doc.url} target="_blank" rel="noreferrer">
                              <Button type="button" variant="outline" size="sm">Download</Button>
                            </a>
                          ) : null}
                          {!readOnlyMode && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  documents: prev.documents.filter((_, i) => i !== index),
                                }))
                              }
                            >
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {editDocumentFiles.map((entry, index) => (
                      <div key={`${entry.file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{entry.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOCUMENT_KIND_OPTIONS.find((item) => item.value === entry.kind)?.label || "Outro"} • pendente de salvar
                          </p>
                        </div>
                        {!readOnlyMode && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditDocumentFiles((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>URL Lattes (auto quando disponível)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={readOnlyMode || editLattesLoading}
                      onClick={() => lookupLattes("edit")}
                    >
                      {editLattesLoading ? "Buscando..." : "Importar Lattes"}
                    </Button>
                  </div>
                  <Input
                    disabled={readOnlyMode}
                    placeholder="http://lattes.cnpq.br/..."
                    value={form.lattesUrl}
                    onChange={(e) => setForm((p) => ({ ...p, lattesUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Resumo Lattes</Label>
                  <Textarea
                    disabled={readOnlyMode}
                    value={form.lattesSummary}
                    onChange={(e) => setForm((p) => ({ ...p, lattesSummary: e.target.value }))}
                    placeholder="Preenchido automaticamente quando disponível."
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Atualização Lattes</Label>
                  <Input
                    disabled={readOnlyMode}
                    value={form.lattesUpdatedAt}
                    onChange={(e) => setForm((p) => ({ ...p, lattesUpdatedAt: e.target.value }))}
                    placeholder="dd/mm/aaaa"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Dados Bancários</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Input disabled={readOnlyMode} value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Agência</Label>
                  <Input disabled={readOnlyMode} value={form.bankAgency} onChange={(e) => setForm((p) => ({ ...p, bankAgency: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Conta</Label>
                  <Input disabled={readOnlyMode} value={form.bankAccount} onChange={(e) => setForm((p) => ({ ...p, bankAccount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de PIX</Label>
                  <Input disabled={readOnlyMode} value={form.pixType} onChange={(e) => setForm((p) => ({ ...p, pixType: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Chave PIX</Label>
                  <Input disabled={readOnlyMode} value={form.pixKey} onChange={(e) => setForm((p) => ({ ...p, pixKey: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {readOnlyMode ? (
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setReadOnlyMode(false)}
              >
                Editar
              </Button>
              {canSendInvites && editingUser && (
                <Button variant="outline" onClick={() => openInviteDialog(editingUser)}>
                  Convite
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setEditDocumentFiles([]);
                  setEditOpen(false);
                }}
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDocumentFiles([]);
                  setEditOpen(false);
                }}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button onClick={saveUser} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar usuário</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Informações Básicas</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={createForm.fullName} onChange={(e) => setCreateForm((p) => ({ ...p, fullName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@dominio.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={createForm.status}
                    onValueChange={(value) => setCreateForm((p) => ({ ...p, status: value }))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/70 p-2">
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={createForm.profileType || "outro"}
                    onValueChange={(value) => setCreateForm((p) => ({ ...p, profileType: value }))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/70 p-2">
                      {PROFILE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Acesso</Label>
                  <Select
                    value={createForm.accessRole}
                    onValueChange={(value) =>
                      setCreateForm((p) => {
                        const nextAccess = value as AccessRole;
                        return {
                          ...p,
                          accessRole: nextAccess,
                          profileType: nextAccess === "admin" ? "admin" : p.profileType,
                        };
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/70 p-2">
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <Label>Foto do usuário (opcional)</Label>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
                    <Avatar className="h-16 w-16 rounded-xl">
                      <AvatarImage src={createForm.avatarUrl || undefined} alt={createForm.fullName || "Usuário"} />
                      <AvatarFallback className="rounded-xl text-sm font-semibold">
                        {(createForm.fullName || "U")
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() ?? "")
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      ref={createAvatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (!isValidAvatarType(file)) {
                          notifyWarning("Formato inválido", "Use JPG, PNG ou WEBP para a foto.");
                          return;
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          notifyWarning("Arquivo grande", "A foto deve ter no máximo 5MB.");
                          return;
                        }
                        setCreateAvatarFile(file);
                        setCreateForm((prev) => ({ ...prev, avatarUrl: URL.createObjectURL(file), avatarPath: "" }));
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => createAvatarInputRef.current?.click()}>
                        {createForm.avatarUrl ? "Trocar foto" : "Selecionar foto"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!createForm.avatarUrl}
                        onClick={() => {
                          setCreateAvatarFile(null);
                          setCreateForm((prev) => ({ ...prev, avatarUrl: "", avatarPath: "" }));
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Informações Profissionais</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input value={createForm.cpf} onChange={(e) => setCreateForm((p) => ({ ...p, cpf: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>RG</Label>
                  <Input value={createForm.rg} onChange={(e) => setCreateForm((p) => ({ ...p, rg: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>CEP</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={createCepLoading}
                      onClick={() => lookupCep("create")}
                    >
                      {createCepLoading ? "Buscando..." : "Buscar CEP"}
                    </Button>
                  </div>
                  <Input
                    value={createForm.cep}
                    onChange={(e) => setCreateForm((p) => ({ ...p, cep: normalizeCep(e.target.value) }))}
                    placeholder="00000-000"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>CRM</Label>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-8 px-2 text-[11px] border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => lookupCfm("create")}
                      disabled={createCfmLoading}
                    >
                      {createCfmLoading ? "Consultando..." : "Consultar CRM/CFM"}
                    </Button>
                  </div>
                  {PROFILE_TYPES_WITH_OPTIONAL_CRM.has((createForm.profileType || "outro") as ProfileTypeOption) && (
                    <p className="text-xs text-muted-foreground">
                      CRM opcional para este tipo de usuário.
                    </p>
                  )}
                  <Input
                    value={createForm.crm}
                    onChange={(e) => {
                      setCreateCfmResult(null);
                      setCreateForm((p) => ({ ...p, crm: e.target.value }));
                    }}
                  />
                  <div className="space-y-2">
                    <Label>UF CRM</Label>
                    <Select
                      value={createForm.crmUf}
                      onValueChange={(value) => setCreateForm((p) => ({ ...p, crmUf: value }))}
                    >
                      <SelectTrigger className="h-10 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/70 p-2">
                        {UF_OPTIONS.map((ufOption) => (
                          <SelectItem key={`create-uf-${ufOption}`} value={ufOption}>
                            {ufOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {createCfmResult && (
                    <div className={`mt-2 rounded-md border p-2 text-xs ${createCfmResult.found ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {createCfmResult.found ? (
                        <>
                          <p className="font-semibold">{createCfmResult.doctor?.nome ?? "Médico localizado"}</p>
                          <p>CRM: {createCfmResult.doctor?.crm ?? "-"} / {createCfmResult.doctor?.uf ?? "-"}</p>
                          <p>Situação: {createCfmResult.doctor?.situacao ?? (createCfmResult.regular ? "Regular" : "Não regular")}</p>
                          {(createCfmResult.verificationStatus || createCfmResult.sourceUsed || createCfmResult.consultedAt) && (
                            <p>
                              Verificação: {createCfmResult.verificationStatus ?? "-"} | Fonte: {createCfmResult.sourceUsed ?? "-"} | Data/hora: {formatDateTime(createCfmResult.consultedAt ?? "") || "-"}
                            </p>
                          )}
                          {Array.isArray(createCfmResult.doctor?.rqeList) && createCfmResult.doctor.rqeList.length > 0 && (
                            <p>RQE(s): {createCfmResult.doctor.rqeList.join(", ")}</p>
                          )}
                          {Array.isArray(createCfmResult.doctor?.rqeDetails) && createCfmResult.doctor.rqeDetails.length > 0 && (
                            <p>
                              RQE + Especialidade:{" "}
                              {createCfmResult.doctor.rqeDetails
                                .map((item) => (item.especialidade ? `${item.rqe} - ${item.especialidade}` : item.rqe))
                                .join(", ")}
                            </p>
                          )}
                        </>
                      ) : (
                        <p>Nenhum registro encontrado no CFM para este CRM.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>RQEs e Especialidades</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCreateForm((prev) => ({
                          ...prev,
                          rqeDetails: [...prev.rqeDetails, { rqe: "", especialidade: "" }],
                        }))
                      }
                    >
                      Adicionar RQE
                    </Button>
                  </div>
                  {createForm.rqeDetails.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum RQE cadastrado.</p>
                  )}
                  <div className="space-y-2">
                    {createForm.rqeDetails.map((item, index) => (
                      <div key={`create-rqe-${index}`} className="grid grid-cols-12 gap-2">
                        <Input
                          className="col-span-4"
                          placeholder="RQE"
                          value={item.rqe}
                          onChange={(e) =>
                            setCreateForm((prev) => {
                              const next = [...prev.rqeDetails];
                              next[index] = { ...next[index], rqe: normalizeRqeValue(e.target.value) };
                              const normalized = normalizeRqeDetails(next);
                              return { ...prev, rqeDetails: normalized, rqe: formatRqeDetails(normalized) };
                            })
                          }
                        />
                        <Input
                          className="col-span-6"
                          placeholder="Especialidade"
                          value={item.especialidade}
                          onChange={(e) =>
                            setCreateForm((prev) => {
                              const next = [...prev.rqeDetails];
                              next[index] = { ...next[index], especialidade: e.target.value };
                              const normalized = normalizeRqeDetails(next);
                              return { ...prev, rqeDetails: normalized, rqe: formatRqeDetails(normalized) };
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="col-span-2"
                          onClick={() =>
                            setCreateForm((prev) => {
                              const next = prev.rqeDetails.filter((_, i) => i !== index);
                              return { ...prev, rqeDetails: next, rqe: formatRqeDetails(next) };
                            })
                          }
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Input
                    value={createForm.rqe}
                    placeholder="Resumo textual dos RQEs"
                    onChange={(e) =>
                      setCreateForm((prev) => {
                        const raw = e.target.value;
                        const parsed = parseRqeDetailsFromText(raw);
                        return { ...prev, rqe: raw, rqeDetails: parsed.length > 0 ? parsed : prev.rqeDetails };
                      })
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={createForm.address} onChange={(e) => setCreateForm((p) => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Currículo / Lattes (opcional)</Label>
                  <input
                    ref={createCurriculumInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (!isValidCurriculumType(file)) {
                        notifyWarning("Formato inválido", "Use PDF, DOC ou DOCX para o currículo.");
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        notifyWarning("Arquivo grande", "O currículo deve ter no máximo 10MB.");
                        return;
                      }
                      setCreateCurriculumFile(file);
                      setCreateForm((prev) => ({
                        ...prev,
                        curriculumFileName: file.name,
                        curriculumUrl: "",
                        curriculumPath: "",
                      }));
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3">
                    <Button type="button" variant="outline" onClick={() => createCurriculumInputRef.current?.click()}>
                      {createForm.curriculumFileName ? "Trocar currículo" : "Importar currículo"}
                    </Button>
                    {createForm.curriculumFileName && <span className="text-xs text-muted-foreground">{createForm.curriculumFileName}</span>}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!createForm.curriculumFileName && !createForm.curriculumUrl}
                      onClick={() => {
                        setCreateCurriculumFile(null);
                        setCreateForm((prev) => ({
                          ...prev,
                          curriculumFileName: "",
                          curriculumUrl: "",
                          curriculumPath: "",
                        }));
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Documentos (diploma, CRM, certificados e outros)</Label>
                  <input
                    ref={createDocumentsInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length === 0) return;
                      const valid: Array<{ file: File; kind: UserDocument["kind"] }> = [];
                      for (const file of files) {
                        if (!isValidDocumentType(file)) {
                          notifyWarning("Formato inválido", `O arquivo "${file.name}" não é suportado.`);
                          continue;
                        }
                        if (file.size > 10 * 1024 * 1024) {
                          notifyWarning("Arquivo grande", `O arquivo "${file.name}" deve ter no máximo 10MB.`);
                          continue;
                        }
                        valid.push({ file, kind: createDocumentKind });
                      }
                      if (valid.length > 0) {
                        setCreateDocumentFiles((prev) => [...prev, ...valid]);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={createDocumentKind}
                        onValueChange={(value) => setCreateDocumentKind(value as UserDocument["kind"])}
                      >
                        <SelectTrigger className="h-10 w-full rounded-xl md:w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/70 p-2">
                          {DOCUMENT_KIND_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" onClick={() => createDocumentsInputRef.current?.click()}>
                        Adicionar documento
                      </Button>
                    </div>
                    {createForm.documents.length === 0 && createDocumentFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p>
                    )}
                    {createForm.documents.map((doc, index) => (
                      <div key={`${doc.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOCUMENT_KIND_OPTIONS.find((item) => item.value === doc.kind)?.label || "Outro"}
                            {doc.uploadedAt ? ` • ${formatDateTime(doc.uploadedAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.url ? (
                            <a href={doc.url} target="_blank" rel="noreferrer">
                              <Button type="button" variant="outline" size="sm">Download</Button>
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCreateForm((prev) => ({
                                ...prev,
                                documents: prev.documents.filter((_, i) => i !== index),
                              }))
                            }
                          >
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                    {createDocumentFiles.map((entry, index) => (
                      <div key={`${entry.file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{entry.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOCUMENT_KIND_OPTIONS.find((item) => item.value === entry.kind)?.label || "Outro"} • pendente de salvar
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCreateDocumentFiles((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>URL Lattes (auto quando disponível)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={createLattesLoading}
                      onClick={() => lookupLattes("create")}
                    >
                      {createLattesLoading ? "Buscando..." : "Importar Lattes"}
                    </Button>
                  </div>
                  <Input
                    placeholder="http://lattes.cnpq.br/..."
                    value={createForm.lattesUrl}
                    onChange={(e) => setCreateForm((p) => ({ ...p, lattesUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Resumo Lattes</Label>
                  <Textarea
                    value={createForm.lattesSummary}
                    onChange={(e) => setCreateForm((p) => ({ ...p, lattesSummary: e.target.value }))}
                    placeholder="Preenchido automaticamente quando disponível."
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Atualização Lattes</Label>
                  <Input
                    value={createForm.lattesUpdatedAt}
                    onChange={(e) => setCreateForm((p) => ({ ...p, lattesUpdatedAt: e.target.value }))}
                    placeholder="dd/mm/aaaa"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Dados Bancários</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Input value={createForm.bankName} onChange={(e) => setCreateForm((p) => ({ ...p, bankName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Agência</Label>
                  <Input value={createForm.bankAgency} onChange={(e) => setCreateForm((p) => ({ ...p, bankAgency: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Conta</Label>
                  <Input value={createForm.bankAccount} onChange={(e) => setCreateForm((p) => ({ ...p, bankAccount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de PIX</Label>
                  <Input value={createForm.pixType} onChange={(e) => setCreateForm((p) => ({ ...p, pixType: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Chave PIX</Label>
                  <Input value={createForm.pixKey} onChange={(e) => setCreateForm((p) => ({ ...p, pixKey: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            * Ao adicionar, o convite é enviado automaticamente por email. Você também pode reenviar manualmente por email/WhatsApp na ação Convite.
          </p>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreateDocumentFiles([]);
                setCreateOpen(false);
              }}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={createUser} disabled={creating}>
              {creating ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sectorDialogOpen} onOpenChange={setSectorDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Setores de {sectorDialogUser?.full_name ?? sectorDialogUser?.name ?? sectorDialogUser?.email ?? "usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/10 p-3">
            {sectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum setor cadastrado.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {sectors.map((sector) => {
                  const checked = sectorDialogSelection.includes(sector.id);
                  return (
                    <button
                      key={sector.id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-foreground transition-colors ${
                        checked
                          ? "border-emerald-500 bg-emerald-500/20"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                      onClick={() => toggleSectorSelection(sector.id, !checked)}
                    >
                      <Checkbox
                        id={`manage-sector-${sector.id}`}
                        checked={checked}
                        className="h-5 w-5 rounded-[4px] border-2 border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white"
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(value) => toggleSectorSelection(sector.id, Boolean(value))}
                      />
                      <Label htmlFor={`manage-sector-${sector.id}`} className="cursor-pointer font-medium leading-tight text-foreground">
                        {sectorsById.get(sector.id)?.name ?? sector.name}
                      </Label>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSectorDialogOpen(false)} disabled={savingSectors}>
              Cancelar
            </Button>
            <Button onClick={saveSectorDialog} disabled={savingSectors}>
              {savingSectors ? "Salvando..." : "Salvar setores"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar profissionais</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p><span className="font-semibold">Arquivo:</span> {importFileName || "-"}</p>
              <p><span className="font-semibold">Linhas válidas:</span> {importRows.length}</p>
              <p><span className="font-semibold">Problemas detectados:</span> {importIssues.length}</p>
              {importSummary && (
                <p className="mt-2 rounded-md bg-background p-2">
                  <span className="font-semibold">Resultado:</span> Criados {importSummary.created}, ignorados {importSummary.skipped}, falhas {importSummary.failed}
                </p>
              )}
            </div>

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-semibold">Prévia das linhas válidas</div>
              <div className="max-h-56 overflow-y-auto px-3 py-2">
                {importRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma linha válida encontrada.</p>
                ) : (
                  <div className="space-y-2">
                    {importRows.slice(0, IMPORT_PREVIEW_LIMIT).map((row) => (
                      <div key={`${row.line}-${row.email}`} className="rounded-md border bg-background p-2 text-sm">
                        <p className="font-medium">{row.nome}</p>
                        <p className="text-muted-foreground">{row.email}</p>
                        <p className="text-muted-foreground">CRM: {row.crm ? `${row.crm}${row.uf ? `/${row.uf}` : ""}` : "Não informado"}</p>
                      </div>
                    ))}
                    {importRows.length > IMPORT_PREVIEW_LIMIT && (
                      <p className="text-xs text-muted-foreground">
                        Mostrando {IMPORT_PREVIEW_LIMIT} de {importRows.length} linhas válidas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {importIssues.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Linhas com problema</p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-800">
                  {importIssues.slice(0, 20).map((issue, index) => (
                    <p key={`${issue.line}-${issue.email ?? ""}-${index}`}>
                      Linha {issue.line}: {issue.email ? `${issue.email} - ` : ""}{issue.error}
                    </p>
                  ))}
                  {importIssues.length > 20 && <p>Mostrando 20 de {importIssues.length} problemas.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              Escolher outro arquivo
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              Fechar
            </Button>
            <Button onClick={importProfessionals} disabled={importing || importRows.length === 0}>
              {importing ? "Importando..." : "Importar agora"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Convite: {inviteUser?.full_name ?? inviteUser?.name ?? inviteUser?.email ?? "usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem do convite</Label>
              <Textarea
                className="min-h-40"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Fechar
            </Button>
            <Button variant="outline" onClick={sendInviteByWhatsapp} disabled={sendingInviteWhatsapp}>
              {sendingInviteWhatsapp ? "Gerando link..." : "WhatsApp"}
            </Button>
            <Button onClick={sendInviteByEmail} disabled={sendingInviteEmail}>
              {sendingInviteEmail ? "Enviando..." : "Enviar email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
