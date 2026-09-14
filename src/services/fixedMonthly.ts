import { supabase } from '@/integrations/supabase/client';
import type { FixedMonthlyMember } from '@/lib/financial/fixedMonthly';

/**
 * Profissionais ativos com valor mensal fixo (memberships.fixed_monthly_value).
 * Com userId, retorna só o próprio vínculo (visão do plantonista; RLS permite ler o seu).
 */
export async function fetchFixedMonthlyMembers(tenantId: string, userId?: string): Promise<FixedMonthlyMember[]> {
  let query = supabase
    .from('memberships')
    .select('user_id, fixed_monthly_value, fixed_monthly_sector_id, profile:profiles!memberships_user_id_profiles_fkey(name, full_name)')
    .eq('tenant_id', tenantId)
    .eq('active', true);
  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) {
    console.error('[fixedMonthly] falha ao carregar valores mensais fixos:', error);
    return [];
  }

  type Row = {
    user_id: string;
    fixed_monthly_value: number | string | null;
    fixed_monthly_sector_id: string | null;
    profile: { name: string | null; full_name: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .map((row) => ({
      user_id: row.user_id,
      name: row.profile?.full_name?.trim() || row.profile?.name?.trim() || 'Sem nome',
      monthly_value: row.fixed_monthly_value === null ? 0 : Number(row.fixed_monthly_value),
      sector_id: row.fixed_monthly_sector_id,
    }))
    .filter((m) => Number.isFinite(m.monthly_value) && m.monthly_value > 0);
}
