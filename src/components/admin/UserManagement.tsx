"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { useUserDetails } from "@/hooks/useUserDetails";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

type RoleType = "admin" | "user" | "owner";
type AccessRole = "admin" | "user";
type ProfileTypeOption = "admin" | "plantonista" | "outro";

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
  rqe: string;
  rg: string;
  address: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  pixType: string;
  pixKey: string;
};

type EditForm = {
  name: string;
  fullName: string;
  email: string;
  phone: string;
  profileType: string;
  status: string;
} & PrivateProfilePayload;

type CreateForm = EditForm & {
  accessRole: AccessRole;
};

const PROFILE_TYPE_OPTIONS: Array<{ value: ProfileTypeOption; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "plantonista", label: "Plantonista" },
  { value: "outro", label: "Outro" },
];

const EMPTY_PRIVATE: PrivateProfilePayload = {
  cpf: "",
  crm: "",
  rqe: "",
  rg: "",
  address: "",
  bankName: "",
  bankAgency: "",
  bankAccount: "",
  pixType: "",
  pixKey: "",
};

const EMPTY_FORM: EditForm = {
  name: "",
  fullName: "",
  email: "",
  phone: "",
  profileType: "plantonista",
  status: "ativo",
  ...EMPTY_PRIVATE,
};

const EMPTY_CREATE_FORM: CreateForm = {
  ...EMPTY_FORM,
  accessRole: "user",
};

export default function UserManagement() {
  const { currentTenantId, currentTenantName, currentRole } = useTenant();
  const { toast } = useToast();
  const { updateUserSectors } = useUserDetails(currentTenantId ?? "");
  const canSendInvites = currentRole === "admin" || currentRole === "owner";

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
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendingInviteEmail, setSendingInviteEmail] = useState(false);

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
      toast({ title: "Erro ao carregar usuários", description: usersRes.error.message, variant: "destructive" });
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
      toast({ title: "Erro ao carregar setores", description: sectorsRes.error.message, variant: "destructive" });
      setSectors([]);
    } else {
      setSectors((sectorsRes.data as SectorRow[]) ?? []);
    }

    if (membershipsRes.error) {
      toast({ title: "Erro ao carregar vínculos de setores", description: membershipsRes.error.message, variant: "destructive" });
      setSectorMemberships([]);
    } else {
      setSectorMemberships(membershipsRes.data ?? []);
    }

    setLoading(false);
  }, [currentTenantId, toast]);

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
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
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
      toast({
        title: "Erro ao excluir usuário",
        description: data?.error || error?.message || "Falha desconhecida",
        variant: "destructive",
      });
      setDeletingUserId(null);
      return;
    }

    const errorList = Array.isArray(data?.errors) ? data.errors : [];
    if (errorList.length > 0) {
      toast({
        title: "Usuário não excluído",
        description: String(errorList[0]),
        variant: "destructive",
      });
    } else {
      toast({ title: "Usuário excluído com sucesso" });
    }

    setDeletingUserId(null);
    await loadData();
  }

  async function openUserModal(user: UserRow, readOnly: boolean) {
    if (!currentTenantId) return;

    setReadOnlyMode(readOnly);
    setEditingUser(user);
    setForm({
      ...EMPTY_FORM,
      name: user.name ?? user.full_name ?? "",
      fullName: user.full_name ?? user.name ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      profileType: user.profile_type ?? "plantonista",
      status: user.status ?? "ativo",
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
      toast({
        title: "Não foi possível carregar dados sensíveis",
        description: data?.error || error?.message || "Verifique permissões de PII",
        variant: "destructive",
      });
      return;
    }

    const privateData = (data.private ?? {}) as Partial<PrivateProfilePayload>;

    setForm((prev) => ({
      ...prev,
      cpf: privateData.cpf ?? "",
      crm: privateData.crm ?? "",
      rqe: privateData.rqe ?? "",
      rg: privateData.rg ?? "",
      address: privateData.address ?? "",
      bankName: privateData.bankName ?? "",
      bankAgency: privateData.bankAgency ?? "",
      bankAccount: privateData.bankAccount ?? "",
      pixType: privateData.pixType ?? "",
      pixKey: privateData.pixKey ?? "",
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

    toast({ title: "Setores atualizados" });

    setSavingSectors(false);
    setSectorDialogOpen(false);
    setSectorDialogUser(null);
    await loadData();
  }

  async function openEdit(user: UserRow) {
    await openUserModal(user, false);
  }

  async function openView(user: UserRow) {
    await openUserModal(user, true);
  }

  async function saveUser() {
    if (!currentTenantId || !editingUser) return;

    setSaving(true);

    const { data, error } = await supabase.functions.invoke("update-user", {
      body: {
        action: "update",
        tenantId: currentTenantId,
        userId: editingUser.user_id,
        payload: {
          name: form.name,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          profileType: form.profileType,
          status: form.status,
          cpf: form.cpf,
          crm: form.crm,
          rqe: form.rqe,
          rg: form.rg,
          address: form.address,
          bankName: form.bankName,
          bankAgency: form.bankAgency,
          bankAccount: form.bankAccount,
          pixType: form.pixType,
          pixKey: form.pixKey,
        },
      },
    });

    if (error || !data?.ok) {
      toast({
        title: "Erro ao salvar usuário",
        description: data?.error || error?.message || "Falha desconhecida",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    toast({ title: "Usuário atualizado com sucesso" });

    setEditOpen(false);
    setEditingUser(null);
    setSaving(false);

    await loadData();
  }

  async function createUser() {
    if (!currentTenantId) return;

    const name = createForm.name.trim();
    const email = createForm.email.trim().toLowerCase();

    if (!name || !email) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Nome e email são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);

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
      toast({
        title: "Erro ao adicionar usuário",
        description: data?.error || error?.message || "Falha desconhecida",
        variant: "destructive",
      });
      setCreating(false);
      return;
    }

    const createdUserId = String(data.userId);

    const { data: detailsData, error: detailsError } = await supabase.functions.invoke("update-user", {
      body: {
        action: "update",
        tenantId: currentTenantId,
        userId: createdUserId,
        payload: {
          name: createForm.name,
          fullName: createForm.fullName || createForm.name,
          email: createForm.email,
          phone: createForm.phone,
          profileType: createForm.profileType,
          status: createForm.status,
          cpf: createForm.cpf,
          crm: createForm.crm,
          rqe: createForm.rqe,
          rg: createForm.rg,
          address: createForm.address,
          bankName: createForm.bankName,
          bankAgency: createForm.bankAgency,
          bankAccount: createForm.bankAccount,
          pixType: createForm.pixType,
          pixKey: createForm.pixKey,
        },
      },
    });

    if (detailsError || !detailsData?.ok) {
      toast({
        title: "Usuário criado, mas faltou salvar dados complementares",
        description: detailsData?.error || detailsError?.message || "Abra editar e complete os dados.",
        variant: "destructive",
      });
    }

    const tempPassword = data?.temporaryPassword as string | undefined;
    toast({
      title: "Usuário adicionado",
      description: tempPassword
        ? `Senha temporária: ${tempPassword}`
        : "Usuário vinculado ao hospital com sucesso.",
    });

    setCreateForm(EMPTY_CREATE_FORM);
    setCreateOpen(false);
    setCreating(false);
    await loadData();
  }

  function buildInviteText(user: UserRow, password?: string) {
    const loginUrl = buildPublicAppUrl("/auth");
    const hospitalName = currentTenantName || "MedEscala";
    const displayName = user.full_name || user.name || "Profissional";
    const passwordLine = password?.trim()
      ? `Senha provisória: ${password.trim()}`
      : "Senha: use \"Esqueci minha senha\" na tela de login.";

    return `Olá, ${displayName}!\n\nVocê foi convidado para o ${hospitalName} no app MedEscala.\nEmail: ${user.email || "-"}\n${passwordLine}\n\nAcesse: ${loginUrl}`;
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
      toast({
        title: "Sem permissão",
        description: "Apenas administradores podem enviar convites.",
        variant: "destructive",
      });
      return;
    }
    setInviteUser(user);
    setInvitePassword("");
    setInviteMessage(buildInviteText(user));
    setInviteOpen(true);
  }

  async function sendInviteByEmail() {
    if (!currentTenantId) return;
    if (!canSendInvites) {
      toast({
        title: "Sem permissão",
        description: "Apenas administradores podem enviar convites.",
        variant: "destructive",
      });
      return;
    }

    if (!inviteUser?.email) {
      toast({
        title: "Usuário sem email",
        description: "Preencha o email do usuário antes de enviar convite.",
        variant: "destructive",
      });
      return;
    }

    setSendingInviteEmail(true);

    const loginUrl = buildPublicAppUrl("/auth");
    const { data, error } = await supabase.functions.invoke("send-invite-email", {
      body: {
        name: inviteUser.full_name || inviteUser.name || "Profissional",
        email: inviteUser.email,
        password: invitePassword.trim() || undefined,
        hospitalName: currentTenantName || "MedEscala",
        loginUrl,
        tenantId: currentTenantId,
      },
    });

    setSendingInviteEmail(false);

    if (error || data?.error) {
      toast({
        title: "Erro ao enviar email",
        description: data?.error || error?.message || "Falha no envio.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Convite enviado por email" });
  }

  function sendInviteByWhatsapp() {
    const phone = normalizeWhatsappPhone(inviteUser?.phone);
    if (!phone) {
      toast({
        title: "Telefone inválido",
        description: "Preencha um telefone válido do usuário (com DDD) para enviar via WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    const encoded = encodeURIComponent(inviteMessage);
    window.open(`https://wa.me/${phone}?text=${encoded}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Gestão de Usuários</h1>
        <Button onClick={() => setCreateOpen(true)}>Adicionar usuário</Button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <div className="w-full">
          <table className="w-full table-fixed border border-border text-xs lg:text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="w-[16%] p-2 border border-border text-left text-foreground">Nome</th>
                <th className="w-[18%] p-2 border border-border text-left text-foreground">Email</th>
                <th className="w-[10%] p-2 border border-border text-left text-foreground">Telefone</th>
                <th className="w-[8%] p-2 border border-border text-left text-foreground">Tipo</th>
                <th className="w-[15%] p-2 border border-border text-left text-foreground">Setores</th>
                <th className="w-[8%] p-2 border border-border text-left text-foreground">Status</th>
                <th className="w-[25%] p-2 border border-border text-left text-foreground">Ações</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-2 border border-border text-foreground break-words">{u.full_name ?? u.name ?? "-"}</td>
                  <td className="p-2 border border-border text-foreground break-words">{u.email ?? "-"}</td>
                  <td className="p-2 border border-border text-foreground break-words">{u.phone ?? "-"}</td>
                  <td className="p-2 border border-border text-foreground break-words">{u.profile_type ?? "outro"}</td>
                  <td className="p-2 border border-border text-foreground">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {(membershipsByUser.get(u.user_id) ?? []).length} setor(es)
                      </span>
                      <Button size="sm" className="h-7 px-2 text-[11px]" variant="outline" onClick={() => openSectorDialog(u)}>
                        Selecionar
                      </Button>
                    </div>
                  </td>
                  <td className="p-2 border border-border text-foreground break-words">{u.active ? "Ativo" : "Inativo"}</td>
                  <td className="p-2 border border-border">
                    <div className={`grid gap-1 ${canSendInvites ? "grid-cols-2" : "grid-cols-1"}`}>
                      {canSendInvites && (
                        <Button size="sm" className="h-7 px-2 text-[11px]" variant="outline" onClick={() => openInviteDialog(u)}>
                          Convite
                        </Button>
                      )}
                      <Button size="sm" className="h-7 px-2 text-[11px]" variant="secondary" onClick={() => openView(u)}>
                        Visualizar
                      </Button>
                      <Button size="sm" className="h-7 px-2 text-[11px]" variant="outline" onClick={() => openEdit(u)}>
                        Editar
                      </Button>
                      <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => toggleActive(u.user_id, u.active)}>
                        {u.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 px-2 text-[11px] text-destructive ${canSendInvites ? "col-span-2" : "col-span-1"}`}
                        disabled={deletingUserId === u.user_id}
                        onClick={() => deleteUser(u)}
                      >
                        {deletingUserId === u.user_id ? "Excluindo..." : "Excluir"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{readOnlyMode ? "Dados do usuário" : "Editar usuário"}</DialogTitle>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input disabled={readOnlyMode} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Nome completo</Label>
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
              <select
                disabled={readOnlyMode}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                disabled={readOnlyMode}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={form.profileType || "outro"}
                onChange={(e) => setForm((p) => ({ ...p, profileType: e.target.value }))}
              >
                {PROFILE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input disabled={readOnlyMode} value={form.cpf} onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>RG</Label>
              <Input disabled={readOnlyMode} value={form.rg} onChange={(e) => setForm((p) => ({ ...p, rg: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>CRM</Label>
              <Input disabled={readOnlyMode} value={form.crm} onChange={(e) => setForm((p) => ({ ...p, crm: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>RQE</Label>
              <Input disabled={readOnlyMode} value={form.rqe} onChange={(e) => setForm((p) => ({ ...p, rqe: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Endereço</Label>
              <Input disabled={readOnlyMode} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            </div>
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

          {readOnlyMode ? (
            <div className="flex justify-end gap-2 mt-6">
              {canSendInvites && editingUser && (
                <Button variant="outline" onClick={() => openInviteDialog(editingUser)}>
                  Convite
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar usuário</DialogTitle>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={createForm.fullName} onChange={(e) => setCreateForm((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={createForm.status}
                onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={createForm.profileType || "outro"}
                onChange={(e) => setCreateForm((p) => ({ ...p, profileType: e.target.value }))}
              >
                {PROFILE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Acesso</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={createForm.accessRole}
                onChange={(e) => setCreateForm((p) => ({ ...p, accessRole: e.target.value as AccessRole }))}
              >
                <option value="user">Usuário</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={createForm.cpf} onChange={(e) => setCreateForm((p) => ({ ...p, cpf: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>RG</Label>
              <Input value={createForm.rg} onChange={(e) => setCreateForm((p) => ({ ...p, rg: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>CRM</Label>
              <Input value={createForm.crm} onChange={(e) => setCreateForm((p) => ({ ...p, crm: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>RQE</Label>
              <Input value={createForm.rqe} onChange={(e) => setCreateForm((p) => ({ ...p, rqe: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Endereço</Label>
              <Input value={createForm.address} onChange={(e) => setCreateForm((p) => ({ ...p, address: e.target.value }))} />
            </div>
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

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={createUser} disabled={creating}>
              {creating ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sectorDialogOpen} onOpenChange={setSectorDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Setores de {sectorDialogUser?.full_name ?? sectorDialogUser?.name ?? sectorDialogUser?.email ?? "usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
            {sectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum setor cadastrado.</p>
            ) : (
              sectors.map((sector) => (
                <div key={sector.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`manage-sector-${sector.id}`}
                    checked={sectorDialogSelection.includes(sector.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSectorDialogSelection((prev) =>
                          prev.includes(sector.id) ? prev : [...prev, sector.id]
                        );
                      } else {
                        setSectorDialogSelection((prev) => prev.filter((id) => id !== sector.id));
                      }
                    }}
                  />
                  <Label htmlFor={`manage-sector-${sector.id}`} className="font-normal cursor-pointer">
                    {sectorsById.get(sector.id)?.name ?? sector.name}
                  </Label>
                </div>
              ))
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

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Convite: {inviteUser?.full_name ?? inviteUser?.name ?? inviteUser?.email ?? "usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Senha provisória (opcional)</Label>
              <Input
                value={invitePassword}
                onChange={(e) => {
                  const value = e.target.value;
                  setInvitePassword(value);
                  if (inviteUser) setInviteMessage(buildInviteText(inviteUser, value));
                }}
                placeholder="Se vazio, usuário define via Esqueci minha senha"
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem do convite</Label>
              <textarea
                className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Fechar
            </Button>
            <Button variant="outline" onClick={sendInviteByWhatsapp}>
              WhatsApp
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
