// Cria o serviço de demonstração para a revisão das lojas.
// Tudo fictício e isolado em um tenant próprio: não encosta no serviço real.
// Idempotente: apaga a demonstração anterior antes de recriar.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const PROJ = 'ppjtcwdbeuhljmfdcxhq'
// Credenciais ficam FORA do repositório. Crie um credenciais-demo.json ao lado
// deste arquivo com {admin:{email,senha}, medico:{email,senha}} antes de rodar.
const creds = JSON.parse(fs.readFileSync(new URL("./credenciais-demo.json", import.meta.url), "utf8"))

function token() {
  const bruto = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(bruto.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8').trim()
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJ}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const txt = await r.text()
  let dados
  try {
    dados = JSON.parse(txt)
  } catch {
    throw new Error(`resposta não-JSON: ${txt.slice(0, 300)}`)
  }
  if (dados?.message) throw new Error(dados.message)
  return dados
}

const SLUG = 'demonstracao'

// Médicos fictícios. Nomes inventados, sem relação com ninguém real.
const MEDICOS = [
  { nome: 'DRA. ANA DEMONSTRAÇÃO', email: 'ana@demo.medescala.app' },
  { nome: 'DR. BRUNO EXEMPLO', email: 'bruno@demo.medescala.app' },
  { nome: 'DRA. CLARA AMOSTRA', email: 'clara@demo.medescala.app' },
  { nome: 'DR. DANIEL MODELO', email: 'daniel@demo.medescala.app' },
  { nome: 'DRA. ELISA TESTE', email: 'elisa@demo.medescala.app' },
]

const esc = (s) => String(s).replace(/'/g, "''")

console.log('1/6 — limpando demonstração anterior, se houver...')
await sql(`
DO $$
DECLARE v_tenant uuid; v_users uuid[];
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = '${SLUG}';
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- Guarda quem é da demonstração ANTES de apagar o serviço: memberships some
  -- no cascade e depois não haveria como saber quais contas remover.
  SELECT array_agg(user_id) INTO v_users FROM memberships WHERE tenant_id = v_tenant;

  -- O serviço primeiro: o cascade leva plantões, atribuições e vínculos. Tentar
  -- apagar as contas antes esbarra em shift_assignments.updated_by, que aponta
  -- para o admin e não é cascade.
  DELETE FROM tenants WHERE id = v_tenant;

  IF v_users IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_users);
  END IF;
END $$;`)

console.log('2/6 — criando o serviço...')
const [{ id: tenantId }] = await sql(`
INSERT INTO tenants (name, slug, plan_id, billing_status, is_unlimited)
VALUES ('MedEscala — Demonstração', '${SLUG}',
        (SELECT id FROM plans WHERE name = 'Plano 1-20 usuários'), 'active', false)
RETURNING id;`)
console.log('   tenant', tenantId)

console.log('3/6 — criando as contas...')
const contas = [
  { nome: 'COORDENAÇÃO (DEMONSTRAÇÃO)', email: creds.admin.email, senha: creds.admin.senha, papel: 'admin' },
  { nome: 'DR. REVISOR DEMONSTRAÇÃO', email: creds.medico.email, senha: creds.medico.senha, papel: 'user' },
  ...MEDICOS.map((m) => ({ ...m, senha: creds.medico.senha, papel: 'user' })),
]

const ids = {}
for (const c of contas) {
  const [{ id }] = await sql(`
WITH novo AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    '${esc(c.email)}', crypt('${esc(c.senha)}', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', '${esc(c.nome)}'), false, false
  ) RETURNING id, email
), ident AS (
  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
         'email', now(), now(), now() FROM novo
)
SELECT id FROM novo;`)
  ids[c.email] = id
  // O gatilho on_auth_user_created já criou o profile; completa os campos de exibição.
  await sql(`UPDATE profiles SET full_name='${esc(c.nome)}', name='${esc(c.nome)}',
             email='${esc(c.email)}', status='ativo', must_change_password=false WHERE id='${id}';`)
  await sql(`INSERT INTO memberships (tenant_id, user_id, role, active)
             VALUES ('${tenantId}', '${id}', '${c.papel}', true);`)
  console.log(`   ${c.papel.padEnd(5)} ${c.nome}`)
}

console.log('4/6 — criando os setores...')
// Um setor SEM exigência de GPS (o revisor consegue bater ponto de qualquer lugar)
// e um COM GPS, mas de raio enorme — assim o pedido de permissão aparece de
// verdade e mesmo assim o check-in funciona de onde quer que ele esteja.
const [{ id: setorUti }] = await sql(`
INSERT INTO sectors (tenant_id, name, description, color, active, checkin_enabled,
                     require_gps_checkin, checkin_tolerance_minutes,
                     default_day_value, default_night_value)
VALUES ('${tenantId}', 'UTI Adulto (demonstração)', 'Setor fictício para avaliação do aplicativo',
        '#2563eb', true, true, false, 30, 1200, 1500) RETURNING id;`)
const [{ id: setorCc }] = await sql(`
INSERT INTO sectors (tenant_id, name, description, color, active, checkin_enabled,
                     require_gps_checkin, allowed_checkin_radius_meters, checkin_tolerance_minutes,
                     reference_latitude, reference_longitude,
                     default_day_value, default_night_value)
VALUES ('${tenantId}', 'Centro Cirúrgico (demonstração)', 'Setor fictício com check-in por localização',
        '#16a34a', true, true, true, 20000000, 30, -23.9608, -46.3336, 1400, 1700) RETURNING id;`)
console.log('   UTI Adulto (sem GPS) e Centro Cirúrgico (com GPS, raio aberto)')

console.log('5/6 — vinculando os médicos aos setores...')
for (const email of Object.keys(ids)) {
  if (email === creds.admin.email) continue
  for (const setor of [setorUti, setorCc]) {
    await sql(`INSERT INTO sector_memberships (sector_id, user_id, tenant_id)
               VALUES ('${setor}', '${ids[email]}', '${tenantId}');`)
  }
}

console.log('6/6 — montando a escala (mês atual e o seguinte)...')
const revisor = ids[creds.medico.email]
const outros = MEDICOS.map((m) => ids[m.email])
const hoje = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))

const plantoes = []
for (let d = -20; d <= 35; d++) {
  const data = new Date(hoje)
  data.setDate(data.getDate() + d)
  const iso = data.toLocaleDateString('en-CA')
  const setor = d % 2 === 0 ? setorUti : setorCc
  const nomeSetor = d % 2 === 0 ? 'UTI Adulto' : 'Centro Cirúrgico'
  // O revisor pega hoje e os próximos dias, para ter o que abrir e onde bater ponto.
  // Resto sempre positivo: d vai a -20 e um % cru devolveria índice negativo.
  const giro = (n) => outros[((n % outros.length) + outros.length) % outros.length]
  const dono = d >= 0 && d <= 6 ? revisor : giro(d)
  plantoes.push({ iso, setor, nomeSetor, dono, diurno: true })
  if (d % 3 === 0) plantoes.push({ iso, setor, nomeSetor, dono: giro(d + 1), diurno: false })
}

// shifts entra direto; shift_assignments NÃO. Existe a trava
// enforce_shift_assignment_snapshot_write, que exige a RPC autorizada para o
// valor do plantão sempre nascer do instantâneo financeiro. Então criamos os
// plantões aqui e as atribuições pela RPC, personificando o admin da
// demonstração (a RPC exige auth.uid() e só aceita 'assigned'/'confirmed'/
// 'completed'/'cancelled' como status).
const adminId = ids[creds.admin.email]
let criados = 0
for (const p of plantoes) {
  const titulo = `${p.nomeSetor} — ${p.diurno ? 'Diurno' : 'Noturno'}`
  const colunaValor = p.diurno ? 'default_day_value' : 'default_night_value'
  const [{ id: shiftId }] = await sql(`
INSERT INTO shifts (tenant_id, sector_id, title, hospital, shift_date, start_time, end_time, base_value)
VALUES ('${tenantId}', '${p.setor}', '${esc(titulo)}', 'Hospital Demonstração', '${p.iso}',
        '${p.diurno ? '07:00' : '19:00'}', '${p.diurno ? '19:00' : '07:00'}',
        (SELECT ${colunaValor} FROM sectors WHERE id='${p.setor}'))
RETURNING id;`)
  await sql(`
DO $do$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '${adminId}', 'role', 'authenticated')::text, true);
  PERFORM public.create_assignment_with_snapshot(
    '${tenantId}'::uuid, '${shiftId}'::uuid, '${p.dono}'::uuid, NULL, 'assigned', '${adminId}'::uuid);
END $do$;`)
  criados++
}

const [resumo] = await sql(`
SELECT (SELECT count(*) FROM memberships WHERE tenant_id='${tenantId}') AS pessoas,
       (SELECT count(*) FROM sectors WHERE tenant_id='${tenantId}') AS setores,
       (SELECT count(*) FROM shifts WHERE tenant_id='${tenantId}') AS plantoes,
       (SELECT count(*) FROM shift_assignments WHERE tenant_id='${tenantId}') AS atribuicoes,
       (SELECT count(*) FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id
         WHERE sa.user_id='${revisor}' AND s.shift_date >= current_date) AS plantoes_futuros_do_revisor;`)

console.log('\n=== SERVIÇO DE DEMONSTRAÇÃO CRIADO ===')
console.log(JSON.stringify({ tenantId, ...resumo, plantoesCriados: criados }, null, 1))
