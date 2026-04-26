#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function addIssue(list, severity, code, message, context = {}) {
  list.push({ severity, code, message, context });
}

function safeJsonStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) return '[Circular]';
        seen.add(currentValue);
      }
      return currentValue;
    },
    2
  );
}

function formatAuditError(error) {
  if (error instanceof Error) {
    const formatted = {
      name: error.name,
      message: error.message,
    };

    if ('code' in error && error.code) formatted.code = error.code;
    if ('details' in error && error.details) formatted.details = error.details;
    if ('hint' in error && error.hint) formatted.hint = error.hint;
    if ('context' in error && error.context) formatted.context = error.context;
    if ('cause' in error && error.cause) formatted.cause = formatAuditError(error.cause);

    return formatted;
  }

  if (typeof error === 'object' && error !== null) {
    return JSON.parse(safeJsonStringify(error));
  }

  return { message: String(error) };
}

async function checkEndpoints(baseUrl, issues) {
  const paths = ['/', '/auth', '/admin', '/admin/financial', '/admin/sectors', '/user/shifts'];
  const checks = [];

  for (const path of paths) {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      if (res.status >= 400) {
        addIssue(issues, 'critical', 'APP_ROUTE_DOWN', `Rota ${path} respondeu ${res.status}`, { url, status: res.status });
      } else if (path === '/') {
        const txt = await res.text();
        if (!txt.toLowerCase().includes('medescala')) {
          addIssue(issues, 'warning', 'APP_BRAND_NOT_FOUND', 'Landing sem marcador esperado "MedEscala"', { url });
        }
      }
      checks.push({ path, ok: res.status < 400, status: res.status });
    } catch (error) {
      addIssue(issues, 'critical', 'APP_ROUTE_FETCH_FAILED', `Falha ao acessar rota ${path}`, {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      checks.push({ path, ok: false, status: null });
    }
  }

  return checks;
}

async function fetchAll(supabase, table, columns, pageSize = 1000, filters = []) {
  let from = 0;
  const rows = [];

  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    for (const f of filters) {
      q = q[f.op](f.col, f.value);
    }

    const { data, error } = await q;
    if (error) {
      const wrappedError = new Error(`Falha ao consultar ${table}`, { cause: error });
      wrappedError.context = {
        table,
        columns,
        range: { from, to: from + pageSize - 1 },
        filters,
      };
      throw wrappedError;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function checkDatabase({ supabase, today, endDate, issues }) {
  const metrics = {};

  const upcomingShifts = await fetchAll(
    supabase,
    'shifts',
    'id,tenant_id,shift_date,start_time,end_time,title,hospital,sector_id,base_value',
    1000,
    [
      { op: 'gte', col: 'shift_date', value: today },
      { op: 'lte', col: 'shift_date', value: endDate },
    ]
  );

  const activeAssignments = await fetchAll(
    supabase,
    'shift_assignments',
    'id,tenant_id,shift_id,user_id,status,assigned_value',
    1000,
    [{ op: 'in', col: 'status', value: ['assigned', 'confirmed', 'completed'] }]
  );

  const memberships = await fetchAll(
    supabase,
    'memberships',
    'tenant_id,user_id,role,active',
    1000,
    [{ op: 'eq', col: 'active', value: true }]
  );

  const profiles = await fetchAll(
    supabase,
    'profiles',
    'id,name,full_name,status,profile_type',
    1000
  );

  const userSectorValues = await fetchAll(
    supabase,
    'user_sector_values',
    'id,tenant_id,user_id,sector_id,month,year,day_value,night_value',
    1000
  );

  const sectorRevenues = await fetchAll(
    supabase,
    'sector_revenues',
    'id,tenant_id,sector_id,month,year,fixed_revenue,variable_revenue',
    1000
  );

  const sectorExpenses = await fetchAll(
    supabase,
    'sector_expenses',
    'id,tenant_id,sector_id,month,year,expense_type,expense_name,amount,notes',
    1000
  );

  const shiftIds = new Set(upcomingShifts.map((s) => s.id));
  const upcomingAssignments = activeAssignments.filter((a) => shiftIds.has(a.shift_id));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  metrics.upcomingShifts = upcomingShifts.length;
  metrics.upcomingAssignments = upcomingAssignments.length;
  metrics.userSectorValues = userSectorValues.length;
  metrics.sectorRevenues = sectorRevenues.length;
  metrics.sectorExpenses = sectorExpenses.length;

  for (const s of upcomingShifts) {
    if (!s.sector_id) {
      addIssue(issues, 'critical', 'SHIFT_WITHOUT_SECTOR', 'Plantão futuro sem setor vinculado', {
        shift_id: s.id,
        tenant_id: s.tenant_id,
        shift_date: s.shift_date,
        title: s.title,
      });
    }
    if (!s.title || !s.hospital || !s.start_time || !s.end_time) {
      addIssue(issues, 'warning', 'SHIFT_MISSING_CORE_FIELDS', 'Plantão com campos essenciais vazios', {
        shift_id: s.id,
        tenant_id: s.tenant_id,
        shift_date: s.shift_date,
      });
    }
    if (s.start_time === s.end_time) {
      addIssue(issues, 'warning', 'SHIFT_TIME_SUSPICIOUS', 'Plantão com hora inicial igual à final', {
        shift_id: s.id,
        tenant_id: s.tenant_id,
        shift_date: s.shift_date,
        time: s.start_time,
      });
    }
    if (s.base_value !== null && num(s.base_value) < 0) {
      addIssue(issues, 'critical', 'SHIFT_NEGATIVE_BASE_VALUE', 'Plantão com valor base negativo', {
        shift_id: s.id,
        tenant_id: s.tenant_id,
        base_value: s.base_value,
      });
    }
  }

  const duplicateAssignmentKey = new Map();
  for (const a of upcomingAssignments) {
    const key = `${a.tenant_id}:${a.shift_id}:${a.user_id}`;
    duplicateAssignmentKey.set(key, (duplicateAssignmentKey.get(key) || 0) + 1);
    if (a.assigned_value !== null && num(a.assigned_value) < 0) {
      addIssue(issues, 'critical', 'ASSIGNMENT_NEGATIVE_VALUE', 'Atribuição com valor negativo', {
        assignment_id: a.id,
        tenant_id: a.tenant_id,
        assigned_value: a.assigned_value,
      });
    }
  }

  for (const [key, count] of duplicateAssignmentKey.entries()) {
    if (count > 1) {
      addIssue(issues, 'critical', 'DUPLICATE_ACTIVE_ASSIGNMENT', 'Usuário com múltiplas atribuições ativas no mesmo plantão', {
        key,
        count,
      });
    }
  }

  const adminByTenant = new Map();
  for (const m of memberships) {
    if (!['admin', 'super_admin'].includes(String(m.role))) continue;
    if (!adminByTenant.has(m.tenant_id)) adminByTenant.set(m.tenant_id, new Set());
    adminByTenant.get(m.tenant_id).add(m.user_id);
  }

  for (const a of upcomingAssignments) {
    const adminSet = adminByTenant.get(a.tenant_id);
    if (adminSet?.has(a.user_id)) {
      addIssue(issues, 'warning', 'ADMIN_ASSIGNED_TO_SHIFT', 'Admin/Super Admin aparecendo em plantão ativo', {
        assignment_id: a.id,
        tenant_id: a.tenant_id,
        user_id: a.user_id,
      });
    }

    const profile = profileMap.get(a.user_id);
    const displayName = (profile?.name || profile?.full_name || '').trim();
    if (!displayName) {
      addIssue(issues, 'critical', 'ASSIGNMENT_WITHOUT_NAME', 'Atribuição ativa sem nome de usuário', {
        assignment_id: a.id,
        tenant_id: a.tenant_id,
        user_id: a.user_id,
      });
    }
  }

  const overrideKeyCount = new Map();
  for (const uv of userSectorValues) {
    const key = `${uv.tenant_id}:${uv.user_id}:${uv.sector_id}:${uv.month ?? 0}:${uv.year ?? 0}`;
    overrideKeyCount.set(key, (overrideKeyCount.get(key) || 0) + 1);

    if (uv.day_value !== null && num(uv.day_value) < 0) {
      addIssue(issues, 'critical', 'NEGATIVE_DAY_OVERRIDE', 'Valor diurno individual negativo', {
        id: uv.id,
        tenant_id: uv.tenant_id,
      });
    }
    if (uv.night_value !== null && num(uv.night_value) < 0) {
      addIssue(issues, 'critical', 'NEGATIVE_NIGHT_OVERRIDE', 'Valor noturno individual negativo', {
        id: uv.id,
        tenant_id: uv.tenant_id,
      });
    }
  }

  for (const [key, count] of overrideKeyCount.entries()) {
    if (count > 1) {
      addIssue(issues, 'critical', 'DUPLICATE_USER_SECTOR_OVERRIDE', 'Valor individual duplicado para mesmo usuário/setor/mês/ano', {
        key,
        count,
      });
    }
  }

  const revenueKeyCount = new Map();
  for (const r of sectorRevenues) {
    const key = `${r.tenant_id}:${r.sector_id}:${r.month}:${r.year}`;
    revenueKeyCount.set(key, (revenueKeyCount.get(key) || 0) + 1);

    if (num(r.fixed_revenue) < 0 || num(r.variable_revenue) < 0) {
      addIssue(issues, 'critical', 'NEGATIVE_SECTOR_REVENUE', 'Receita de setor negativa', {
        id: r.id,
        tenant_id: r.tenant_id,
        fixed_revenue: r.fixed_revenue,
        variable_revenue: r.variable_revenue,
      });
    }
  }

  for (const [key, count] of revenueKeyCount.entries()) {
    if (count > 1) {
      addIssue(issues, 'critical', 'DUPLICATE_SECTOR_REVENUE', 'Mais de um registro de receita para mesmo setor/mês/ano', {
        key,
        count,
      });
    }
  }

  for (const e of sectorExpenses) {
    if (num(e.amount) < 0) {
      addIssue(issues, 'critical', 'NEGATIVE_SECTOR_EXPENSE', 'Despesa de setor negativa', {
        id: e.id,
        tenant_id: e.tenant_id,
        amount: e.amount,
      });
    }

    if ((e.notes || '').startsWith('[[CONTABIL]]')) {
      const raw = (e.notes || '').replace('[[CONTABIL]]', '');
      try {
        const parsed = JSON.parse(raw);
        if (!parsed.key || !['fixed', 'percent'].includes(parsed.mode)) {
          addIssue(issues, 'warning', 'MALFORMED_ACCOUNTING_NOTE', 'Despesa contábil com metadado inconsistente', {
            id: e.id,
            tenant_id: e.tenant_id,
            notes: e.notes,
          });
        }
      } catch {
        addIssue(issues, 'warning', 'INVALID_ACCOUNTING_NOTE_JSON', 'Despesa contábil com JSON inválido', {
          id: e.id,
          tenant_id: e.tenant_id,
        });
      }
    }
  }

  return metrics;
}

function buildMarkdownReport(result) {
  const lines = [];
  lines.push('# Auditoria Diária - MedEscala');
  lines.push('');
  lines.push(`- Executado em: ${result.executedAt}`);
  lines.push(`- Status: **${result.status.toUpperCase()}**`);
  lines.push(`- Erros críticos: **${result.summary.critical}**`);
  lines.push(`- Alertas: **${result.summary.warning}**`);
  lines.push('');

  lines.push('## Métricas');
  lines.push('');
  for (const [key, value] of Object.entries(result.metrics)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');

  lines.push('## Verificação de Rotas');
  lines.push('');
  for (const check of result.routeChecks) {
    lines.push(`- ${check.ok ? 'OK' : 'FALHA'} ${check.path} (${check.status ?? 'erro'})`);
  }
  lines.push('');

  lines.push('## Achados');
  lines.push('');
  if (result.issues.length === 0) {
    lines.push('- Nenhum problema encontrado.');
  } else {
    result.issues.slice(0, 200).forEach((issue, idx) => {
      lines.push(`${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.code} - ${issue.message}`);
      lines.push(`   - contexto: ${JSON.stringify(issue.context)}`);
    });
    if (result.issues.length > 200) {
      lines.push(`- ... e mais ${result.issues.length - 200} achados.`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const executedAt = nowIso();
  const baseUrl = process.env.AUDIT_APP_URL || process.env.VITE_APP_URL || 'https://app.medescalas.com.br';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const todayDate = new Date();
  const today = isoDate(todayDate);
  const endDate = isoDate(new Date(todayDate.getTime() + 45 * DAY_MS));

  const issues = [];
  const routeChecks = await checkEndpoints(baseUrl, issues);
  const metrics = {};

  if (!supabaseUrl || !serviceRoleKey) {
    addIssue(
      issues,
      'critical',
      'MISSING_SUPABASE_CONFIG',
      'SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes. Auditoria de dados não executada.',
      { hasSupabaseUrl: Boolean(supabaseUrl), hasServiceRoleKey: Boolean(serviceRoleKey) }
    );
  } else {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const dbMetrics = await checkDatabase({ supabase, today, endDate, issues });
      Object.assign(metrics, dbMetrics);
    } catch (error) {
      addIssue(issues, 'critical', 'DATABASE_AUDIT_FAILED', 'Falha ao executar auditoria de banco', {
        error: formatAuditError(error),
      });
    }
  }

  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warning = issues.filter((i) => i.severity === 'warning').length;
  const status = critical > 0 ? 'failed' : warning > 0 ? 'warning' : 'ok';

  const result = {
    executedAt,
    status,
    summary: { critical, warning, total: issues.length },
    routeChecks,
    metrics,
    issues,
  };

  const reportJson = JSON.stringify(result, null, 2);
  const reportMd = buildMarkdownReport(result);

  await import('node:fs/promises').then((fs) =>
    Promise.all([
      fs.mkdir('audit-results', { recursive: true }),
      fs.writeFile('audit-results/latest-audit.json', reportJson, 'utf8'),
      fs.writeFile('audit-results/latest-audit.md', reportMd, 'utf8'),
    ])
  );

  console.log(reportMd);

  if (critical > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[audit] erro fatal', error);
  process.exit(1);
});
