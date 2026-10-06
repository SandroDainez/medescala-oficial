import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type AtribuicaoBruta,
  dataBR,
  hojeEmBrasilia,
  mensagemParaAdmin,
  movimentosDeLiberacao,
  separarPlantoes,
  tituloParaAdmin,
} from './logica.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured')
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    if (!anonKey) throw new Error('SUPABASE_ANON_KEY not configured')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized: missing token' }, 401)
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseUser.auth.getUser()

    if (authError || !requestingUser) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Esta função age SEMPRE e SÓ sobre quem chamou. Não aceita user_id do corpo:
    // ninguém encerra a conta de outra pessoa por aqui.
    const userId = requestingUser.id

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch (_e) {
      body = {}
    }
    const confirmar = body?.confirm === true

    // ── Levantamento (serve para a prévia e para a execução) ──────────────────

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

    const nome =
      (profile?.full_name as string | undefined)?.trim() || requestingUser.email || 'Profissional'

    const { data: superAdmin } = await supabaseAdmin
      .from('super_admins')
      .select('user_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()

    const { data: memberships } = await supabaseAdmin
      .from('memberships')
      .select('id, tenant_id, role, active, tenants ( name )')
      .eq('user_id', userId)

    const vinculosAtivos = (memberships ?? []).filter((m: any) => m.active)

    // Impedimentos: o encerramento não pode deixar a plataforma nem um serviço sem dono.
    const impedimentos: string[] = []

    if (superAdmin) {
      impedimentos.push(
        'Esta conta administra a plataforma MedEscala. Transfira a administração antes de encerrá-la.',
      )
    }

    for (const m of vinculosAtivos) {
      if (!['admin', 'owner'].includes(m.role as string)) continue
      const { count: outrosAdmins } = await supabaseAdmin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', m.tenant_id)
        .in('role', ['admin', 'owner'])
        .eq('active', true)
        .neq('user_id', userId)

      if ((outrosAdmins ?? 0) === 0) {
        const nomeServico = (m as any).tenants?.name ?? 'seu serviço'
        impedimentos.push(
          `Você é o único administrador de "${nomeServico}". Promova outro administrador antes de ` +
            'encerrar sua conta, senão o serviço fica sem ninguém para gerenciar a escala.',
        )
      }
    }

    const hoje = hojeEmBrasilia()

    const { data: atribuicoes } = await supabaseAdmin
      .from('shift_assignments')
      .select('id, tenant_id, shifts ( shift_date, title, start_time, end_time, sector_id )')
      .eq('user_id', userId)

    const { futuros, passados } = separarPlantoes(
      (atribuicoes ?? []) as unknown as AtribuicaoBruta[],
      hoje,
    )

    const resumo = {
      nome,
      plantoesPassados: passados,
      plantoesFuturos: futuros.length,
      plantoesFuturosDatas: futuros.map((f) => ({
        data: f.shiftDate,
        titulo: f.title,
        inicio: f.startTime,
      })),
      servicos: vinculosAtivos.map((m: any) => m.tenants?.name ?? 'Serviço'),
      impedimentos,
    }

    if (impedimentos.length > 0) {
      // Vale para prévia e para confirmação: nunca executa com impedimento.
      return json({ ok: false, bloqueado: true, ...resumo }, confirmar ? 409 : 200)
    }

    if (!confirmar) {
      return json({ ok: true, previa: true, ...resumo })
    }

    // ── Execução ──────────────────────────────────────────────────────────────

    const agora = new Date().toISOString()
    const avisos: string[] = []

    // 1) Avisa os administradores ANTES de liberar os plantões.
    //    O aviso não aponta para shift_assignment_id de propósito: aquela FK é
    //    ON DELETE CASCADE, e o aviso morreria junto com o plantão liberado.
    for (const m of vinculosAtivos) {
      const tenantId = m.tenant_id as string
      const futurosDoServico = futuros.filter((f) => f.tenantId === tenantId)

      const { data: admins } = await supabaseAdmin
        .from('memberships')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .in('role', ['admin', 'owner'])
        .eq('active', true)

      const destinatarios = (admins ?? [])
        .map((a: any) => a.user_id as string)
        .filter((id) => id && id !== userId)

      if (destinatarios.length === 0) continue

      const { error: notifyError } = await supabaseAdmin.from('notifications').insert(
        destinatarios.map((adminUserId) => ({
          tenant_id: tenantId,
          user_id: adminUserId,
          type: 'account_closed_admin',
          title: tituloParaAdmin(futurosDoServico),
          message: mensagemParaAdmin(nome, futurosDoServico),
        })),
      )
      if (notifyError) {
        console.error('[delete-own-account] falha ao notificar admins:', notifyError.message)
        avisos.push(`notificacao:${notifyError.message}`)
      }
    }

    if (futuros.length > 0) {
      // 2) Trilha permanente, antes de apagar qualquer coisa.
      const { error: movError } = await supabaseAdmin
        .from('schedule_movements')
        .insert(movimentosDeLiberacao(futuros, userId, nome, agora))

      if (movError) {
        // Sem trilha não se libera plantão: o administrador perderia o rastro de
        // quem estava escalado naquela vaga.
        console.error('[delete-own-account] falha na trilha:', movError.message)
        return json(
          {
            error:
              'Não foi possível registrar a liberação dos plantões futuros. Nada foi alterado. Tente novamente.',
            detalhe: movError.message,
          },
          500,
        )
      }

      // 3) Libera os plantões futuros — a vaga volta a aparecer aberta na escala.
      const { error: delFuturosError } = await supabaseAdmin
        .from('shift_assignments')
        .delete()
        .eq('user_id', userId)
        .in(
          'id',
          futuros.map((f) => f.assignmentId),
        )

      if (delFuturosError) {
        console.error('[delete-own-account] falha ao liberar futuros:', delFuturosError.message)
        return json(
          {
            error: 'Não foi possível liberar os plantões futuros. Nada foi alterado.',
            detalhe: delFuturosError.message,
          },
          500,
        )
      }
    }

    // 4) Tira os vínculos: perde acesso e sai das listas de escala.
    const { error: delSectorError } = await supabaseAdmin
      .from('sector_memberships')
      .delete()
      .eq('user_id', userId)
    if (delSectorError) avisos.push(`sector_memberships:${delSectorError.message}`)

    const { error: delMembershipError } = await supabaseAdmin
      .from('memberships')
      .delete()
      .eq('user_id', userId)
    if (delMembershipError) {
      return json(
        {
          error: 'Não foi possível remover seus vínculos. Nada mais foi alterado.',
          detalhe: delMembershipError.message,
        },
        500,
      )
    }

    // 5) Apaga os dados pessoais sensíveis (CPF, RG, endereço, banco, PIX).
    const { error: piiError } = await supabaseAdmin
      .from('profiles_private')
      .delete()
      .eq('user_id', userId)
    if (piiError) avisos.push(`profiles_private:${piiError.message}`)

    const { error: pushError } = await supabaseAdmin
      .from('push_device_tokens')
      .delete()
      .eq('user_id', userId)
    if (pushError) avisos.push(`push_device_tokens:${pushError.message}`)

    const { error: prefsError } = await supabaseAdmin
      .from('user_notification_preferences')
      .delete()
      .eq('user_id', userId)
    if (prefsError) avisos.push(`user_notification_preferences:${prefsError.message}`)

    // 6) O perfil fica, inativo, porque os plantões já realizados apontam para ele.
    //    É o que preserva o nome na escala e no financeiro já fechado.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ status: 'inativo', updated_at: agora })
      .eq('id', userId)
    if (profileError) avisos.push(`profiles:${profileError.message}`)

    // 7) Bloqueia o login. Apagar a conta de auth cascatearia os plantões.
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    })
    if (banError) {
      console.error('[delete-own-account] falha ao bloquear login:', banError.message)
      avisos.push(`auth:${banError.message}`)
    }

    console.log(
      `[delete-own-account] conta encerrada: ${userId} | futuros liberados: ${futuros.length} ` +
        `(${futuros.map((f) => dataBR(f.shiftDate)).join(', ')}) | passados mantidos: ${passados}`,
    )

    return json({
      ok: true,
      encerrada: true,
      plantoesFuturosLiberados: futuros.length,
      plantoesPassadosMantidos: passados,
      avisos: avisos.length > 0 ? avisos : undefined,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao encerrar a conta'
    console.error('[delete-own-account] erro:', message)
    return json({ error: message }, 500)
  }
})
