import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Settings, Smartphone, Shield, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import NotificationPreferences from "@/components/user/NotificationPreferences";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type SelfForm = {
  fullName: string;
  email: string;
  phone: string;
  crm: string;
  crmUf: string;
  rqe: string;
  lattesUrl: string;
  lattesSummary: string;
  lattesUpdatedAt: string;
  avatarUrl: string;
  avatarPath: string;
  curriculumUrl: string;
  curriculumPath: string;
  curriculumFileName: string;
};

const EMPTY_FORM: SelfForm = {
  fullName: "",
  email: "",
  phone: "",
  crm: "",
  crmUf: "SP",
  rqe: "",
  lattesUrl: "",
  lattesSummary: "",
  lattesUpdatedAt: "",
  avatarUrl: "",
  avatarPath: "",
  curriculumUrl: "",
  curriculumPath: "",
  curriculumFileName: "",
};

function normalizeRqeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

function normalizeRqeDetails(values: unknown): Array<{ rqe: string; especialidade: string }> {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      rqe: String((item as any)?.rqe ?? "").trim(),
      especialidade: String((item as any)?.especialidade ?? "").trim(),
    }))
    .filter((item) => item.rqe.length > 0);
}

function parseCrm(raw: string): { crm: string; uf: string } {
  const normalized = String(raw ?? "").trim().toUpperCase();
  const match = normalized.match(/(\d{3,8})\s*\/?\s*([A-Z]{2})?/);
  return { crm: match?.[1] ?? "", uf: match?.[2] ?? "" };
}

function formatCrmWithUf(crmRaw: string, ufRaw: string) {
  const crm = String(crmRaw ?? "").replace(/\D/g, "").trim();
  const uf = String(ufRaw ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (!crm) return "";
  return uf ? `${crm}/${uf}` : crm;
}

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

export default function UserSettings() {
  const { user } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cfmLoading, setCfmLoading] = useState(false);
  const [lattesLoading, setLattesLoading] = useState(false);
  const [form, setForm] = useState<SelfForm>(EMPTY_FORM);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [curriculumFile, setCurriculumFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const curriculumInputRef = useRef<HTMLInputElement | null>(null);

  const notifyError = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: "destructive" });
  }, [toast]);

  const notifySuccess = useCallback((title: string, description?: string) => {
    toast({ title, description });
  }, [toast]);

async function fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
  return btoa(binary);
}

function getFileExtension(fileName: string): string {
  const trimmed = String(fileName ?? "").trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) return "";
  return trimmed.slice(dot);
}

function isValidCurriculumType(file: File): boolean {
  const validMimeTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  const validExtensions = new Set([".pdf", ".doc", ".docx"]);
  const normalizedType = String(file.type ?? "").trim().toLowerCase();
  const extension = getFileExtension(file.name);
  if (normalizedType && normalizedType !== "application/octet-stream") {
    return validMimeTypes.has(normalizedType);
  }
  return validExtensions.has(extension);
}

  const loadSelfProfile = useCallback(async () => {
    if (!currentTenantId) return;

    setLoadingProfile(true);
    const { data, error } = await supabase.functions.invoke("update-user", {
      body: {
        action: "self_get",
        tenantId: currentTenantId,
      },
    });
    setLoadingProfile(false);

    if (error || !data?.ok) {
      notifyError("Falha ao carregar perfil", data?.error || error?.message);
      return;
    }

    const profile = data?.profile ?? {};
    const priv = data?.private ?? {};
    const media = data?.media ?? {};
    const parsedCrm = parseCrm(String(priv.crm ?? ""));
    setForm({
      ...EMPTY_FORM,
      fullName: String(profile.full_name ?? profile.name ?? "").trim(),
      email: String(profile.email ?? user?.email ?? "").trim(),
      phone: String(profile.phone ?? "").trim(),
      crm: parsedCrm.crm || String(priv.crm ?? "").trim(),
      crmUf: parsedCrm.uf || "SP",
      rqe: String(priv.rqe ?? "").trim(),
      lattesUrl: String(media.lattesUrl ?? "").trim(),
      lattesSummary: String(media.lattesSummary ?? "").trim(),
      lattesUpdatedAt: String(media.lattesUpdatedAt ?? "").trim(),
      avatarUrl: String(media.avatarUrl ?? "").trim(),
      avatarPath: String(media.avatarPath ?? "").trim(),
      curriculumUrl: String(media.curriculumUrl ?? "").trim(),
      curriculumPath: String(media.curriculumPath ?? "").trim(),
      curriculumFileName: String(media.curriculumFileName ?? "").trim(),
    });
  }, [currentTenantId, notifyError, user?.email]);

  useEffect(() => {
    if (!currentTenantId) return;
    void loadSelfProfile();
  }, [currentTenantId, loadSelfProfile]);

  async function lookupCfm() {
    const normalized = form.crm.trim().toUpperCase();
    const match = normalized.match(/(\d{3,8})\s*\/?\s*([A-Z]{2})?/);
    const crm = match?.[1] ?? "";
    const uf = form.crmUf || match?.[2] || "";
    if (!crm) {
      notifyError("CRM inválido", "Informe um CRM válido.");
      return;
    }

    setCfmLoading(true);
    let data: any = null;
    let error: any = null;
    try {
      const response = await supabase.functions.invoke("verify-professional", {
        body: {
          crm,
          uf,
          tenantId: currentTenantId ?? null,
          userId: user?.id ?? null,
        },
      });
      data = response.data;
      error = response.error;
    } catch (invokeError) {
      error = invokeError;
    } finally {
      setCfmLoading(false);
    }

    if (error || !data?.ok) {
      notifyError("Falha na consulta CFM", data?.error || error?.message);
      return;
    }

    const doctor = data?.doctor ?? {};
    const rqeList = normalizeRqeList(doctor.rqeList);
    const rqeDetails = normalizeRqeDetails(doctor.rqeDetails).map((item) =>
      item.especialidade ? `${item.rqe} - ${item.especialidade}` : item.rqe,
    );
    const mergedRqe = Array.from(new Set([...rqeList, ...rqeDetails]));
    const autoLattesUrl = String(doctor.lattesUrl ?? "").trim();
    const autoPhoto = String(doctor.fotoUrl ?? "").trim();

    setForm((prev) => ({
      ...prev,
      fullName: prev.fullName.trim() ? prev.fullName : String(doctor.nome ?? "").trim(),
      rqe: mergedRqe.length
        ? Array.from(new Set([...prev.rqe.split(/[;,|]/g).map((x) => x.trim()).filter(Boolean), ...mergedRqe])).join(", ")
        : prev.rqe,
      lattesUrl: prev.lattesUrl || autoLattesUrl || "",
      avatarUrl: prev.avatarUrl || autoPhoto || "",
    }));

    if (autoLattesUrl) {
      await lookupLattes(autoLattesUrl);
    }
  }

  async function lookupLattes(sourceOverride?: string) {
    const source = (sourceOverride ?? form.lattesUrl ?? "").trim();
    if (!source) {
      notifyError("Lattes não informado", "Informe URL/ID do Lattes.");
      return;
    }

    setLattesLoading(true);
    let data: any = null;
    let error: any = null;
    try {
      const response = await supabase.functions.invoke("lookup-lattes", {
        body: { lattes: source },
      });
      data = response.data;
      error = response.error;
    } catch (invokeError) {
      error = invokeError;
    } finally {
      setLattesLoading(false);
    }

    if (error || !data?.ok) {
      notifyError("Falha ao importar Lattes", data?.error || error?.message);
      return;
    }

    const lattes = data?.lattes ?? {};
    setForm((prev) => ({
      ...prev,
      lattesUrl: String(lattes.canonicalUrl ?? "").trim() || prev.lattesUrl,
      lattesSummary: String(lattes.summary ?? "").trim() || prev.lattesSummary,
      lattesUpdatedAt: String(lattes.updatedAt ?? "").trim() || prev.lattesUpdatedAt,
      fullName: prev.fullName.trim() ? prev.fullName : String(lattes.name ?? "").trim(),
    }));
    notifySuccess("Lattes importado");
  }

  async function saveSelfProfile() {
    if (!currentTenantId) return;
    setSavingProfile(true);

    let avatarFileBase64: string | undefined;
    let curriculumFileBase64: string | undefined;
    try {
      if (avatarFile) avatarFileBase64 = await fileToBase64(avatarFile);
      if (curriculumFile) curriculumFileBase64 = await fileToBase64(curriculumFile);
    } catch {
      setSavingProfile(false);
      notifyError("Falha no arquivo", "Não foi possível processar arquivo selecionado.");
      return;
    }

    const { data, error } = await supabase.functions.invoke("update-user", {
      body: {
        action: "self_update",
        tenantId: currentTenantId,
        payload: {
          name: form.fullName,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          crm: formatCrmWithUf(form.crm, form.crmUf),
          crmUf: form.crmUf,
          rqe: form.rqe,
          avatarUrl: form.avatarUrl || null,
          avatarPath: form.avatarPath || null,
          curriculumUrl: form.curriculumUrl || null,
          curriculumPath: form.curriculumPath || null,
          curriculumFileName: form.curriculumFileName || null,
          lattesUrl: form.lattesUrl || null,
          lattesSummary: form.lattesSummary || null,
          lattesUpdatedAt: form.lattesUpdatedAt || null,
          avatarFileBase64,
          avatarFileName: avatarFile?.name,
          avatarFileType: avatarFile?.type,
          curriculumFileBase64,
          curriculumFileNameUpload: curriculumFile?.name,
          curriculumFileType: curriculumFile?.type,
        },
      },
    });

    setSavingProfile(false);
    if (error || !data?.ok) {
      notifyError("Falha ao salvar perfil", data?.error || error?.message);
      return;
    }

    const hadAvatarUpload = Boolean(avatarFile);
    setAvatarFile(null);
    setCurriculumFile(null);
    if (hadAvatarUpload) {
      notifySuccess("Foto salva com sucesso");
    }
    notifySuccess("Perfil atualizado");
    await loadSelfProfile();
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Preferências</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
            <Avatar className="h-16 w-16 rounded-xl">
              <AvatarImage src={form.avatarUrl || undefined} alt={form.fullName || "Usuário"} />
              <AvatarFallback className="rounded-xl">
                {(form.fullName || user?.email || "U")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? "")
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                  notifyError("Formato inválido", "Use JPG, PNG ou WEBP.");
                  return;
                }
                setAvatarFile(file);
                setForm((prev) => ({ ...prev, avatarUrl: URL.createObjectURL(file), avatarPath: "" }));
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                {form.avatarUrl ? "Trocar foto" : "Adicionar foto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!form.avatarUrl}
                onClick={() => {
                  setAvatarFile(null);
                  setForm((prev) => ({ ...prev, avatarUrl: "", avatarPath: "" }));
                }}
              >
                Remover
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input disabled value={currentTenantName || "Não vinculado"} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>CRM</Label>
                <Button type="button" size="sm" variant="outline" disabled={cfmLoading} onClick={lookupCfm}>
                  {cfmLoading ? "Consultando..." : "Consultar CRM/CFM"}
                </Button>
              </div>
              <Input value={form.crm} onChange={(e) => setForm((prev) => ({ ...prev, crm: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>UF CRM</Label>
              <Select
                value={form.crmUf}
                onValueChange={(value) => setForm((prev) => ({ ...prev, crmUf: value }))}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/70 p-2">
                  {UF_OPTIONS.map((uf) => (
                    <SelectItem key={`user-uf-${uf}`} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>RQE</Label>
              <Input value={form.rqe} onChange={(e) => setForm((prev) => ({ ...prev, rqe: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Currículo (PDF/DOC/DOCX)</Label>
            <input
              ref={curriculumInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!isValidCurriculumType(file)) {
                  notifyError("Formato inválido", "Use PDF, DOC ou DOCX para o currículo.");
                  event.currentTarget.value = "";
                  return;
                }
                if (file.size > 10 * 1024 * 1024) {
                  notifyError("Arquivo grande", "O currículo deve ter no máximo 10MB.");
                  event.currentTarget.value = "";
                  return;
                }
                setCurriculumFile(file);
                setForm((prev) => ({
                  ...prev,
                  curriculumFileName: file.name,
                  curriculumUrl: "",
                  curriculumPath: "",
                }));
              }}
            />
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3">
              <Button type="button" variant="outline" onClick={() => curriculumInputRef.current?.click()}>
                {form.curriculumFileName ? "Trocar currículo" : "Importar currículo"}
              </Button>
              {form.curriculumUrl && (
                <a href={form.curriculumUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  Visualizar arquivo atual
                </a>
              )}
              {form.curriculumFileName && <span className="text-xs text-muted-foreground">{form.curriculumFileName}</span>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label>URL Lattes</Label>
                <Button type="button" size="sm" variant="outline" disabled={lattesLoading} onClick={() => lookupLattes()}>
                  {lattesLoading ? "Buscando..." : "Importar Lattes"}
                </Button>
              </div>
              <Input value={form.lattesUrl} onChange={(e) => setForm((prev) => ({ ...prev, lattesUrl: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Resumo Lattes</Label>
              <Textarea
                className="min-h-24"
                value={form.lattesSummary}
                onChange={(e) => setForm((prev) => ({ ...prev, lattesSummary: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Última atualização do Lattes</Label>
              <Input value={form.lattesUpdatedAt} onChange={(e) => setForm((prev) => ({ ...prev, lattesUpdatedAt: e.target.value }))} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/change-password")}>
              Alterar senha
            </Button>
            <Button size="sm" onClick={saveSelfProfile} disabled={savingProfile || loadingProfile || !currentTenantId}>
              {savingProfile ? "Salvando..." : "Salvar perfil"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <NotificationPreferences />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="h-5 w-5" />
            Aplicativo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Modo escuro</Label>
              <p className="text-sm text-muted-foreground">Tema do aplicativo</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Segurança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => navigate("/change-password")}>
            Alterar senha
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
