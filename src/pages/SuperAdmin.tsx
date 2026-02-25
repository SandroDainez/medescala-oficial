import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format, addMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Building2, 
  Users, 
  Calendar, 
  Shield, 
  Infinity as InfinityIcon, 
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit,
  LogOut,
  RefreshCw,
  Stethoscope,
  Search,
  Database,
  Lock,
  UserPlus,
  UserMinus,
  Crown,
  Plus,
  Trash2,
  Mail,
  MessageCircle,
  CalendarDays,
  BarChart3
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  billing_status: string;
  is_unlimited: boolean;
  trial_ends_at: string | null;
  current_users_count: number;
  max_users: number;
  plan_name: string | null;
  created_at: string;
  admin_count: number;
  plantonista_count: number;
  sector_count: number;
  active_shifts_30d: number;
  paid_events_count: number;
  pending_events_count: number;
  last_paid_at: string | null;
  reopen_password: string | null;
  reopen_password_must_change: boolean;
  reopen_password_updated_at: string | null;
}

interface SuperAdminAccess {
  user_id: string;
  email: string | null;
  profile_name: string | null;
  active: boolean;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
}

interface TenantAdminContact {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_type: string | null;
}

interface TenantBillingEvent {
  id: string;
  tenant_id: string;
  reference_date: string | null;
  due_date: string | null;
  amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

interface TenantSuperAdminDetails {
  tenant_id: string;
  tenant_name: string;
  total_users: number;
  admin_count: number;
  plantonista_count: number;
  sector_count: number;
  active_shifts_30d: number;
  plantonista_names: string[];
}

interface TenantReopenPasswordStatus {
  has_password: boolean;
  current_password: string | null;
  must_change: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

interface PlanOption {
  id: string;
  name: string;
  min_users: number;
  max_users: number;
}

export default function SuperAdmin() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAppOwner, setIsAppOwner] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminAccess[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [migratingPii, setMigratingPii] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createAdminEmail, setCreateAdminEmail] = useState('');
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [tenantDetails, setTenantDetails] = useState<TenantSuperAdminDetails | null>(null);
  const [tenantAdminContacts, setTenantAdminContacts] = useState<TenantAdminContact[]>([]);
  const [tenantBillingEvents, setTenantBillingEvents] = useState<TenantBillingEvent[]>([]);
  const [tenantReopenPasswordStatus, setTenantReopenPasswordStatus] = useState<TenantReopenPasswordStatus | null>(null);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [billingFormAmount, setBillingFormAmount] = useState('');
  const [billingFormStatus, setBillingFormStatus] = useState('pending');
  const [billingFormReferenceDate, setBillingFormReferenceDate] = useState('');
  const [billingFormDueDate, setBillingFormDueDate] = useState('');
  const [billingFormNotes, setBillingFormNotes] = useState('');
  const [savingBillingEvent, setSavingBillingEvent] = useState(false);
  const [deletingBillingEventId, setDeletingBillingEventId] = useState<string | null>(null);
  
  const [managingSuperAdmins, setManagingSuperAdmins] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantAsOwner, setGrantAsOwner] = useState(false);

  // Edit form state
  const [editBillingStatus, setEditBillingStatus] = useState('');
  const [editIsUnlimited, setEditIsUnlimited] = useState(false);
  const [editPlanId, setEditPlanId] = useState('');
  const [editTrialMonths, setEditTrialMonths] = useState(1);
  const [editTrialEndsAtDate, setEditTrialEndsAtDate] = useState('');

  async function handleMigratePii() {
    setMigratingPii(true);
    try {
      // Obter sessão para garantir que o token seja enviado
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Sessão não encontrada. Faça login novamente.');
      }

      const { data, error } = await supabase.functions.invoke('migrate-pii', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: 'Migração concluída!',
        description:
          data?.message || `${data?.profilesWithEncryptedData || 0} perfis com dados criptografados.`,
      });

      if (data?.errors && data.errors.length > 0) {
        console.error('Migration errors:', data.errors);
      }
    } catch (err: any) {
      // O supabase-js costuma retornar uma mensagem genérica em erros 4xx/5xx.
      // Aqui extraímos o body real para mostrar o motivo (ex.: missing secret, não autorizado, etc.).
      let description = err?.message || 'Falha ao executar migração.';

      const body = err?.context?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error) description = parsed.error;
        } catch {
          // ignore JSON parse errors
        }
      }

      console.error('migrate-pii invoke error:', err);

      toast({
        title: 'Erro na migração',
        description,
        variant: 'destructive',
      });
    } finally {
      setMigratingPii(false);
    }
  }

  const fetchTenants = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_all_tenants_admin');

    if (error) {
      console.error('Error fetching tenants:', error);
      toast({
        title: 'Erro ao carregar hospitais',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setTenants(data || []);
  }, [toast]);

  const fetchSuperAdmins = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_super_admin_access');

    if (error) {
      toast({
        title: 'Erro ao carregar superadministradores',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setSuperAdmins((data || []) as SuperAdminAccess[]);
  }, [toast]);

  const fetchPlanOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, min_users, max_users')
      .eq('active', true)
      .order('max_users', { ascending: true });

    if (error) {
      toast({
        title: 'Erro ao carregar planos',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setPlanOptions((data || []) as PlanOption[]);
  }, [toast]);

  const handleGrantSuperAdmin = useCallback(async () => {
    const email = grantEmail.trim().toLowerCase();
    if (!email) {
      toast({
        title: 'Email obrigatório',
        description: 'Informe o email do usuário que receberá acesso de superadministrador.',
        variant: 'destructive',
      });
      return;
    }

    setManagingSuperAdmins(true);
    const { error } = await supabase.rpc('set_super_admin_access_by_email', {
      _email: email,
      _active: true,
      _is_owner: grantAsOwner,
    });
    setManagingSuperAdmins(false);

    if (error) {
      toast({
        title: 'Erro ao conceder acesso',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Acesso de superadministrador atualizado com sucesso.' });
    setGrantEmail('');
    setGrantAsOwner(false);
    fetchSuperAdmins();
  }, [fetchSuperAdmins, grantAsOwner, grantEmail, toast]);

  const handleSetSuperAdminAccess = useCallback(async (entry: SuperAdminAccess, nextActive: boolean, nextOwner: boolean) => {
    setManagingSuperAdmins(true);
    const { error } = await supabase.rpc('set_super_admin_access', {
      _target_user_id: entry.user_id,
      _active: nextActive,
      _is_owner: nextOwner,
    });
    setManagingSuperAdmins(false);

    if (error) {
      toast({
        title: 'Erro ao atualizar superadministrador',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Permissões de superadministrador atualizadas.' });
    fetchSuperAdmins();
  }, [fetchSuperAdmins, toast]);

  const resetBillingForm = useCallback(() => {
    setBillingFormAmount('');
    setBillingFormStatus('pending');
    setBillingFormReferenceDate('');
    setBillingFormDueDate('');
    setBillingFormNotes('');
  }, []);

  const fetchTenantDetails = useCallback(async (tenantId: string) => {
    setDetailsLoading(true);
    const [detailsRes, contactsRes, billingRes, reopenStatusRes] = await Promise.all([
      supabase.rpc('get_tenant_super_admin_details', { _tenant_id: tenantId }),
      supabase.rpc('get_tenant_admin_contacts', { _tenant_id: tenantId }),
      supabase.rpc('list_tenant_billing_events', { _tenant_id: tenantId }),
      supabase.rpc('get_tenant_reopen_password_status', { _tenant_id: tenantId }),
    ]);
    setDetailsLoading(false);

    if (detailsRes.error || contactsRes.error || billingRes.error || reopenStatusRes.error) {
      toast({
        title: 'Erro ao carregar detalhes',
        description:
          detailsRes.error?.message ||
          contactsRes.error?.message ||
          billingRes.error?.message ||
          reopenStatusRes.error?.message ||
          'Falha inesperada',
        variant: 'destructive',
      });
      return;
    }

    setTenantDetails((detailsRes.data?.[0] as TenantSuperAdminDetails) || null);
    setTenantAdminContacts((contactsRes.data || []) as TenantAdminContact[]);
    setTenantBillingEvents((billingRes.data || []) as TenantBillingEvent[]);
    setTenantReopenPasswordStatus((reopenStatusRes.data?.[0] as TenantReopenPasswordStatus) || null);
  }, [toast]);

  const handleOpenDetails = useCallback(async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setDetailsDialogOpen(true);
    resetBillingForm();
    setTenantReopenPasswordStatus(null);
    await fetchTenantDetails(tenant.id);
  }, [fetchTenantDetails, resetBillingForm]);

  const handleCreateTenant = useCallback(async () => {
    const name = createName.trim();
    const slug = createSlug.trim().toLowerCase();
    if (!name || !slug) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe nome e código do hospital/serviço.',
        variant: 'destructive',
      });
      return;
    }

    setCreatingTenant(true);
    const { error } = await supabase.rpc('super_admin_create_tenant', {
      _name: name,
      _slug: slug,
      _admin_email: createAdminEmail.trim() || null,
    });
    setCreatingTenant(false);

    if (error) {
      toast({
        title: 'Erro ao criar hospital',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Hospital criado com sucesso.' });
    setCreateName('');
    setCreateSlug('');
    setCreateAdminEmail('');
    setCreateDialogOpen(false);
    fetchTenants();
  }, [createAdminEmail, createName, createSlug, fetchTenants, toast]);

  const handleDeleteTenant = useCallback(async (tenant: Tenant) => {
    const confirmSlug = window.prompt(
      `Para confirmar a exclusão definitiva, digite o código do hospital: ${tenant.slug}`
    );

    if (!confirmSlug) return;

    setDeletingTenantId(tenant.id);
    const { error } = await supabase.rpc('super_admin_delete_tenant', {
      _tenant_id: tenant.id,
      _confirm_slug: confirmSlug.trim().toLowerCase(),
    });
    setDeletingTenantId(null);

    if (error) {
      toast({
        title: 'Erro ao excluir hospital',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Hospital removido com sucesso.' });
    if (selectedTenant?.id === tenant.id) {
      setDetailsDialogOpen(false);
      setSelectedTenant(null);
      setTenantDetails(null);
      setTenantAdminContacts([]);
      setTenantBillingEvents([]);
    }
    fetchTenants();
  }, [fetchTenants, selectedTenant?.id, toast]);

  const handleSaveBillingEvent = useCallback(async () => {
    if (!selectedTenant) return;
    const amount = Number(billingFormAmount.replace(',', '.'));
    if (!Number.isFinite(amount)) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor numérico para o lançamento.',
        variant: 'destructive',
      });
      return;
    }

    setSavingBillingEvent(true);
    const { error } = await supabase.rpc('upsert_tenant_billing_event', {
      _tenant_id: selectedTenant.id,
      _amount: amount,
      _status: billingFormStatus,
      _reference_date: billingFormReferenceDate || null,
      _due_date: billingFormDueDate || null,
      _paid_at: billingFormStatus === 'paid' ? new Date().toISOString() : null,
      _notes: billingFormNotes.trim() || null,
    });
    setSavingBillingEvent(false);

    if (error) {
      toast({
        title: 'Erro ao salvar histórico',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Histórico de cobrança atualizado.' });
    resetBillingForm();
    await fetchTenantDetails(selectedTenant.id);
    fetchTenants();
  }, [
    billingFormAmount,
    billingFormDueDate,
    billingFormNotes,
    billingFormReferenceDate,
    billingFormStatus,
    fetchTenantDetails,
    fetchTenants,
    resetBillingForm,
    selectedTenant,
    toast,
  ]);

  const handleDeleteBillingEvent = useCallback(async (eventId: string) => {
    if (!selectedTenant) return;

    setDeletingBillingEventId(eventId);
    const { error } = await supabase.rpc('delete_tenant_billing_event', {
      _id: eventId,
    });
    setDeletingBillingEventId(null);

    if (error) {
      toast({
        title: 'Erro ao excluir lançamento',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Lançamento removido.' });
    await fetchTenantDetails(selectedTenant.id);
    fetchTenants();
  }, [fetchTenantDetails, fetchTenants, selectedTenant, toast]);

  const checkSuperAdminAndFetch = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if user is super admin
    const { data: isSA } = await supabase.rpc('is_super_admin');
    
    if (!isSA) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    const { data: isOwner } = await supabase.rpc('is_app_owner');

    setIsSuperAdmin(true);
    setIsAppOwner(Boolean(isOwner));
    await Promise.all([fetchTenants(), fetchSuperAdmins(), fetchPlanOptions()]);
    setLoading(false);
  }, [user, fetchTenants, fetchSuperAdmins, fetchPlanOptions]);

  useEffect(() => {
    checkSuperAdminAndFetch();
  }, [checkSuperAdminAndFetch]);

  function openEditDialog(tenant: Tenant) {
    const matchedPlan = planOptions.find((p) => p.name === tenant.plan_name);
    setSelectedTenant(tenant);
    setEditBillingStatus(tenant.billing_status);
    setEditIsUnlimited(tenant.is_unlimited);
    setEditPlanId(matchedPlan?.id || '');
    setEditTrialMonths(1);
    setEditTrialEndsAtDate(
      tenant.trial_ends_at ? format(new Date(tenant.trial_ends_at), 'yyyy-MM-dd') : ''
    );
    setEditDialogOpen(true);
  }

  useEffect(() => {
    if (!editDialogOpen || !selectedTenant || editPlanId || planOptions.length === 0) return;
    const matchedPlan = planOptions.find((p) => p.name === selectedTenant.plan_name);
    if (matchedPlan) setEditPlanId(matchedPlan.id);
  }, [editDialogOpen, selectedTenant, editPlanId, planOptions]);

  async function handleSaveChanges() {
    if (!selectedTenant) return;

    setSaving(true);

    // Calculate new trial end date if extending
    let newTrialEndsAt: string | null = null;
    let clearTrialEndsAt = false;
    if (editBillingStatus === 'trial' && !editIsUnlimited) {
      if (editTrialEndsAtDate) {
        newTrialEndsAt = new Date(`${editTrialEndsAtDate}T23:59:59`).toISOString();
      } else {
        newTrialEndsAt = endOfMonth(addMonths(new Date(), editTrialMonths)).toISOString();
      }
    } else {
      clearTrialEndsAt = true;
    }

    const { error } = await supabase.rpc('update_tenant_access', {
      _tenant_id: selectedTenant.id,
      _billing_status: editBillingStatus,
      _is_unlimited: editIsUnlimited,
      _trial_ends_at: newTrialEndsAt,
      _clear_trial_ends_at: clearTrialEndsAt,
    });

    if (!error && editPlanId) {
      const { error: planError } = await (supabase as any).rpc('super_admin_set_tenant_plan', {
        _tenant_id: selectedTenant.id,
        _plan_id: editPlanId,
      });

      if (planError) {
        setSaving(false);
        toast({
          title: 'Erro ao atualizar plano',
          description: planError.message,
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(false);

    if (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Hospital atualizado!' });
    setEditDialogOpen(false);
    fetchTenants();
  }

  function getStatusBadge(tenant: Tenant) {
    if (tenant.is_unlimited) {
      return (
        <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">
          <InfinityIcon className="h-3 w-3 mr-1" />
          Ilimitado
        </Badge>
      );
    }

    if (tenant.billing_status === 'active') {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle className="h-3 w-3 mr-1" />
          Ativo
        </Badge>
      );
    }

    if (tenant.billing_status === 'expired') {
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20">
          <XCircle className="h-3 w-3 mr-1" />
          Expirado
        </Badge>
      );
    }

    // Trial status
    const trialEndsAt = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const now = new Date();
    const isExpired = trialEndsAt && trialEndsAt < now;
    const daysRemaining = trialEndsAt 
      ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) 
      : 0;

    if (isExpired) {
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20">
          <XCircle className="h-3 w-3 mr-1" />
          Trial Expirado
        </Badge>
      );
    }

    if (daysRemaining <= 7) {
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Trial ({daysRemaining}d)
        </Badge>
      );
    }

    return (
      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
        <Clock className="h-3 w-3 mr-1" />
        Trial ({daysRemaining}d)
      </Badge>
    );
  }

  function openWhatsapp(phone: string | null, hospitalName: string) {
    if (!phone) {
      toast({
        title: 'Telefone não informado',
        description: 'Cadastre o telefone do administrador para usar WhatsApp.',
        variant: 'destructive',
      });
      return;
    }
    const digits = phone.replace(/\D/g, '');
    const text = encodeURIComponent(`Olá! Contato da administração MedEscala - ${hospitalName}.`);
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function openEmail(email: string | null, hospitalName: string) {
    if (!email) {
      toast({
        title: 'Email não informado',
        description: 'Administrador sem email válido.',
        variant: 'destructive',
      });
      return;
    }
    const subject = encodeURIComponent(`Contato MedEscala - ${hospitalName}`);
    window.location.href = `mailto:${email}?subject=${subject}`;
  }

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.billing_status === 'active' || t.is_unlimited).length,
    trial: tenants.filter(t => t.billing_status === 'trial' && !t.is_unlimited).length,
    expired: tenants.filter(t => {
      if (t.is_unlimited || t.billing_status === 'active') return false;
      if (t.billing_status === 'expired') return true;
      if (t.trial_ends_at && new Date(t.trial_ends_at) < new Date()) return true;
      return false;
    }).length,
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Verificando permissões...</div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Shield className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/home')} className="w-full">
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-purple-600 text-white">
                <Shield className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Super<span className="text-purple-600">Admin</span>
              </span>
            </div>
            <Badge variant="outline" className="text-purple-600 border-purple-600">
              Master
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 lg:p-8 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Hospitais</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ativos/Ilimitados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Em Trial</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.trial}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Expirados</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.expired}</div>
            </CardContent>
          </Card>
        </div>

        {/* Security Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Segurança de Dados
            </CardTitle>
            <CardDescription>
              Ferramentas de migração e proteção de dados sensíveis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleMigratePii} 
              disabled={migratingPii}
              variant="outline"
            >
              {migratingPii ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Migrando...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Migrar dados PII para colunas criptografadas
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Converte CPF, CRM, telefone, endereço e dados bancários para armazenamento criptografado.
            </p>
          </CardContent>
        </Card>

        {/* Super Admin Access Management */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Controle de Superadministradores
            </CardTitle>
            <CardDescription>
              Acesso super admin é exclusivo do dono do aplicativo e dos usuários autorizados pelo dono.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAppOwner ? (
              <>
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="superadmin-email">Email do usuário</Label>
                      <Input
                        id="superadmin-email"
                        placeholder="usuario@dominio.com"
                        value={grantEmail}
                        onChange={(e) => setGrantEmail(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end gap-3 pb-1">
                      <Switch
                        checked={grantAsOwner}
                        onCheckedChange={setGrantAsOwner}
                        id="grant-as-owner"
                      />
                      <Label htmlFor="grant-as-owner">Conceder como dono do app</Label>
                    </div>
                  </div>
                  <Button onClick={handleGrantSuperAdmin} disabled={managingSuperAdmins}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Conceder acesso
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Somente dono do aplicativo pode conceder, remover ou alterar superadministradores.
              </p>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo</TableHead>
                    {isAppOwner && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {superAdmins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAppOwner ? 6 : 5} className="text-center text-muted-foreground py-6">
                        Nenhum superadministrador cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    superAdmins.map((entry) => {
                      const isSelf = entry.user_id === user?.id;
                      return (
                        <TableRow key={entry.user_id}>
                          <TableCell className="font-medium">
                            {entry.profile_name || 'Sem nome'}
                          </TableCell>
                          <TableCell>{entry.email || '-'}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{entry.user_id}</code>
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.active ? 'default' : 'secondary'}>
                              {entry.active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.is_owner ? (
                              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                                <Crown className="h-3 w-3 mr-1" />
                                Dono
                              </Badge>
                            ) : (
                              <Badge variant="outline">Autorizado</Badge>
                            )}
                          </TableCell>
                          {isAppOwner && (
                            <TableCell className="text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={managingSuperAdmins || isSelf}
                                onClick={() => handleSetSuperAdminAccess(entry, !entry.active, entry.is_owner)}
                              >
                                <UserMinus className="h-4 w-4 mr-1" />
                                {entry.active ? 'Desativar' : 'Ativar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={managingSuperAdmins || isSelf}
                                onClick={() => handleSetSuperAdminAccess(entry, entry.active, !entry.is_owner)}
                              >
                                {entry.is_owner ? 'Remover dono' : 'Tornar dono'}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Tenants Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Hospitais Cadastrados</CardTitle>
                <CardDescription>Gerencie o acesso de todos os hospitais</CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar hospital..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar hospital
                </Button>
                <Button variant="outline" size="icon" onClick={fetchTenants}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Equipe</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Pagamentos</TableHead>
                    <TableHead>Senha Reabrir</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Nenhum hospital encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {tenant.slug}
                          </code>
                        </TableCell>
                        <TableCell>{getStatusBadge(tenant)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {tenant.current_users_count}/{tenant.max_users >= 999999 ? '200+' : tenant.max_users}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            <div>{tenant.admin_count} admins</div>
                            <div>{tenant.plantonista_count} plantonistas</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            <div>{tenant.sector_count} setores</div>
                            <div>{tenant.active_shifts_30d} plantões (30d)</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            <div>{tenant.pending_events_count} pendentes</div>
                            <div>{tenant.paid_events_count} pagos</div>
                            <div>
                              {tenant.last_paid_at
                                ? `Último: ${format(new Date(tenant.last_paid_at), 'dd/MM/yyyy', { locale: ptBR })}`
                                : 'Sem histórico'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-semibold">{tenant.reopen_password || '-'}</div>
                            <div className="text-muted-foreground">
                              {tenant.reopen_password_must_change ? 'Troca obrigatória' : 'Personalizada'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetails(tenant)}
                            >
                              <BarChart3 className="h-4 w-4 mr-1" />
                              Detalhes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(tenant)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {isAppOwner && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={deletingTenantId === tenant.id}
                                onClick={() => handleDeleteTenant(tenant)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Acesso - {selectedTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Acesso Ilimitado</Label>
                <p className="text-sm text-muted-foreground">
                  Remove todas as restrições de trial
                </p>
              </div>
              <Switch
                checked={editIsUnlimited}
                onCheckedChange={setEditIsUnlimited}
              />
            </div>

            {!editIsUnlimited && (
              <>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Select value={editPlanId} onValueChange={setEditPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {planOptions.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} ({plan.min_users} - {plan.max_users >= 999999 ? '200+' : plan.max_users})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editBillingStatus} onValueChange={setEditBillingStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Ativo (Pago)</SelectItem>
                      <SelectItem value="expired">Expirado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editBillingStatus === 'trial' && (
                  <div className="space-y-2">
                    <Label>Estender Trial por</Label>
                    <Select 
                      value={editTrialMonths.toString()} 
                      onValueChange={(v) => setEditTrialMonths(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 mês</SelectItem>
                        <SelectItem value="2">2 meses</SelectItem>
                        <SelectItem value="3">3 meses</SelectItem>
                        <SelectItem value="6">6 meses</SelectItem>
                        <SelectItem value="12">12 meses</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="space-y-2 pt-2">
                      <Label htmlFor="trial-ends-at-date">Ou definir prazo manual</Label>
                      <Input
                        id="trial-ends-at-date"
                        type="date"
                        value={editTrialEndsAtDate}
                        onChange={(e) => setEditTrialEndsAtDate(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Novo vencimento: {editTrialEndsAtDate
                        ? format(new Date(`${editTrialEndsAtDate}T00:00:00`), "dd/MM/yyyy", { locale: ptBR })
                        : format(endOfMonth(addMonths(new Date(), editTrialMonths)), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveChanges} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Hospital/Serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-hospital-name">Nome</Label>
              <Input
                id="create-hospital-name"
                placeholder="Ex.: Hospital Central"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-hospital-slug">Código</Label>
              <Input
                id="create-hospital-slug"
                placeholder="Ex.: hospital-central"
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-hospital-admin-email">Email do administrador inicial (opcional)</Label>
              <Input
                id="create-hospital-admin-email"
                placeholder="admin@hospital.com"
                value={createAdminEmail}
                onChange={(e) => setCreateAdminEmail(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Novo hospital inicia limpo, com trial gratuito e senha de reabertura padrão `123456`.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTenant} disabled={creatingTenant}>
              {creatingTenant ? 'Criando...' : 'Criar hospital'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="w-[96vw] max-w-5xl h-[88vh] p-0">
          <div className="flex h-full flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>
                Painel do Hospital - {selectedTenant?.name || 'Hospital'}
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {detailsLoading ? (
                <div className="py-10 text-center text-muted-foreground">Carregando detalhes...</div>
              ) : (
                <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">Usuários</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xl font-semibold">{tenantDetails?.total_users ?? 0}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">Admins</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xl font-semibold">{tenantDetails?.admin_count ?? 0}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">Plantonistas</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xl font-semibold">{tenantDetails?.plantonista_count ?? 0}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">Setores/Atividade</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div>{tenantDetails?.sector_count ?? 0} setores</div>
                    <div>{tenantDetails?.active_shifts_30d ?? 0} plantões (30d)</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Senha de Reabertura da Escala
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-sm">
                    Senha atual: <span className="font-semibold">{tenantReopenPasswordStatus?.current_password || 'Não definida'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {tenantReopenPasswordStatus?.must_change ? 'troca obrigatória no primeiro acesso' : 'senha já personalizada pelo hospital'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Atualizada em:{' '}
                    {tenantReopenPasswordStatus?.updated_at
                      ? format(new Date(tenantReopenPasswordStatus.updated_at), 'dd/MM/yyyy HH:mm')
                      : '-'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Administradores do hospital
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tenantAdminContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum administrador encontrado.</p>
                  ) : (
                    tenantAdminContacts.map((admin) => (
                      <div
                        key={admin.user_id}
                        className="rounded-md border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                      >
                        <div>
                          <p className="font-medium">{admin.full_name}</p>
                          <p className="text-xs text-muted-foreground">{admin.email || '-'}</p>
                          <p className="text-xs text-muted-foreground">{admin.phone || 'Sem telefone'}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEmail(admin.email, selectedTenant?.name || 'Hospital')}>
                            <Mail className="h-4 w-4 mr-1" />
                            Email
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openWhatsapp(admin.phone, selectedTenant?.name || 'Hospital')}>
                            <MessageCircle className="h-4 w-4 mr-1" />
                            WhatsApp
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Histórico de pagamentos da assinatura
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-5">
                    <Input
                      placeholder="Valor"
                      value={billingFormAmount}
                      onChange={(e) => setBillingFormAmount(e.target.value)}
                    />
                    <Select value={billingFormStatus} onValueChange={setBillingFormStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Pago</SelectItem>
                        <SelectItem value="overdue">Atrasado</SelectItem>
                        <SelectItem value="waived">Sem cobrança</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={billingFormReferenceDate}
                      onChange={(e) => setBillingFormReferenceDate(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={billingFormDueDate}
                      onChange={(e) => setBillingFormDueDate(e.target.value)}
                    />
                    <Button onClick={handleSaveBillingEvent} disabled={savingBillingEvent}>
                      {savingBillingEvent ? 'Salvando...' : 'Registrar'}
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Observações do lançamento (opcional)"
                    value={billingFormNotes}
                    onChange={(e) => setBillingFormNotes(e.target.value)}
                  />

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Referência</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pago em</TableHead>
                          <TableHead>Obs</TableHead>
                          <TableHead className="text-right">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tenantBillingEvents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                              Nenhum lançamento de cobrança.
                            </TableCell>
                          </TableRow>
                        ) : (
                          tenantBillingEvents.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell>{event.reference_date ? format(new Date(`${event.reference_date}T00:00:00`), 'dd/MM/yyyy') : '-'}</TableCell>
                              <TableCell>{event.due_date ? format(new Date(`${event.due_date}T00:00:00`), 'dd/MM/yyyy') : '-'}</TableCell>
                              <TableCell>R$ {Number(event.amount || 0).toFixed(2)}</TableCell>
                              <TableCell>{event.status}</TableCell>
                              <TableCell>{event.paid_at ? format(new Date(event.paid_at), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                              <TableCell className="max-w-[240px] truncate">{event.notes || '-'}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  disabled={deletingBillingEventId === event.id}
                                  onClick={() => handleDeleteBillingEvent(event.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Plantonistas cadastrados</CardTitle>
                </CardHeader>
                <CardContent>
                  {tenantDetails?.plantonista_names?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {tenantDetails.plantonista_names.map((name, idx) => (
                        <Badge key={`${name}-${idx}`} variant="outline">{name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem plantonistas cadastrados.</p>
                  )}
                </CardContent>
              </Card>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
