# Decisões de Segurança (Riscos Aceitos)

Este projeto tem alguns alertas recorrentes na área de Segurança que são **intencionais** devido às necessidades operacionais do sistema de gestão de escalas médicas.

---

## 1) Admin do tenant pode ver dados pessoais/bancários de usuários do mesmo tenant

**Tabela:** `profiles_private`  
**Campos sensíveis:** CPF, CRM, telefone, endereço, conta/agência/banco, chave PIX

**Motivo:**  
Administradores (coordenadores/financeiro) do hospital precisam dessas informações para:
- Processar pagamentos e transferências bancárias aos plantonistas.
- Validar identidade (CRM) para compliance e relatórios.
- Entrar em contato (telefone/endereço) em emergências operacionais.

**Controles existentes:**
- RLS impede qualquer acesso fora do tenant (função `can_admin_access_profile` valida mesmo tenant).
- Dono do perfil sempre tem acesso total aos próprios dados.
- Não há acesso anônimo nem público.

**Risco residual:**  
Se conta de admin for comprometida, atacante teria acesso a dados de funcionários daquele tenant.

**Mitigações recomendadas (futuro):**
- Habilitar MFA para contas admin.
- Implementar trilha de auditoria para acessos a dados sensíveis.
- Separar permissão "Financeiro" de "Admin" genérico.

---

## 2) Admin do tenant pode ver/gerenciar pagamentos de usuários do mesmo tenant

**Tabela:** `payments`

**Motivo:**  
Administradores precisam criar, editar, fechar e excluir registros de pagamento para operação financeira.

**Controles existentes:**
- RLS restringe SELECT/INSERT/UPDATE/DELETE apenas a admins do tenant.
- Usuários comuns só veem os próprios pagamentos (SELECT onde `user_id = auth.uid()`).

**Risco residual:**  
Admin comprometido teria acesso a todos os valores de pagamento do tenant.

---

## 3) Usuários podem ver os próprios pagamentos

**Motivo:**  
Transparência para o plantonista saber quanto receberá/recebeu.

**Controles existentes:**
- RLS garante que SELECT só retorna linhas onde `user_id = auth.uid()` e membership ativa no tenant.

---

## 4) Valores de plantão visíveis a membros do tenant

**Tabelas:** `shifts.base_value`, `shift_entries.valor`

**Motivo:**  
Plantonistas precisam saber o valor ao se candidatar ou aceitar um plantão.

**Controles existentes:**
- RLS exige membership ativa no tenant; sem acesso externo.

---

## 5) Perfis (`profiles`) sem coluna `tenant_id`

**Motivo arquitetural:**  
Um usuário pode pertencer a múltiplos tenants (ex.: médico em vários hospitais). O perfil é único; a associação é via `memberships`.

**Controles existentes:**
- Função `can_admin_access_profile` valida que admin e usuário compartilham **pelo menos um tenant em comum** com membership ativa.
- Dono sempre vê o próprio perfil.

---

## 6) Senhas temporárias enviadas por e-mail

**Motivo:**  
Onboarding rápido: admin cria conta → usuário recebe senha → é obrigado a trocar no primeiro login (`must_change_password = true`).

**Controles existentes:**
- Flag `must_change_password` força troca imediata.
- Senha é gerada aleatoriamente (12+ caracteres).

**Mitigações futuras (opcional):**  
Trocar para magic-link ou reset via e-mail.

---

## 7) Leaked Password Protection desativado

**Motivo:**  
Configuração padrão do backend; pode ser habilitada nas configurações de autenticação do Cloud.

---

## 8) Políticas RLS RESTRICTIVE para bloqueio de acesso anônimo

**Data de implementação:** 2026-01-25

**Tabelas afetadas (30 tabelas):**
- `profiles`, `profiles_private`, `payments`, `shifts`, `shift_assignments`
- `shift_assignment_locations`, `shift_entries`, `shift_offers`, `swap_requests`
- `tenants`, `memberships`, `sectors`, `sector_memberships`, `sector_revenues`, `sector_expenses`
- `user_roles`, `user_sector_values`, `plans`, `notifications`, `absences`
- `schedule_finalizations`, `schedule_movements`, `conflict_resolutions`
- `pii_access_permissions`, `payment_access_permissions`, `pii_audit_logs`, `gps_access_logs`
- `super_admins`, `system_settings`, `login_cpf_rate_limits`

**Políticas aplicadas:**
```sql
CREATE POLICY "Block anon access on [table]"
ON public.[table]
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
```

**Controles adicionais:**
- `FORCE ROW LEVEL SECURITY` aplicado em todas as tabelas
- View `shift_assignment_locations_secure` com `security_invoker = true`
- Permissões `REVOKE ALL FROM anon` na view de GPS

---

## 9) Shifts com sector_id NULL visíveis para membros do tenant

**Motivo:**  
Shifts sem setor definido são ofertas gerais disponíveis para todos os plantonistas do tenant.

**Controles existentes:**
- RLS RESTRICTIVE bloqueia anon
- `is_tenant_member()` exigido para qualquer acesso

---

## 10) GPS - Histórico ilimitado para admins

**Motivo:**  
Necessário para auditoria trabalhista e compliance com legislação de ponto.

**Controles existentes:**
- Usuários veem apenas últimos 30 dias
- Acesso de admin é auditado via `gps_access_logs`
- Função `get_assignment_location_with_audit` registra cada consulta

---

## Observações

- Estes itens devem permanecer como **risco aceito** (não são bugs).
- Se a política de negócio mudar, revise as permissões e registre uma nova decisão aqui.
- Ao rodar o scanner de segurança, ignore os findings listados acima ou marque-os como "risco aceito" com referência a este documento.

## Resumo de Segurança (2026-01-27)

| Categoria | Status |
|-----------|--------|
| Acesso anônimo bloqueado | ✅ 30 tabelas com RESTRICTIVE TO anon |
| RLS habilitada + forçada | ✅ Todas as tabelas |
| Isolamento de tenant | ✅ Via `is_tenant_member()` e `is_tenant_admin()` |
| GPS auditing | ✅ `gps_access_logs` + view segura |
| PII isolado | ✅ `profiles_private` com SELECT bloqueado + criptografia + edge function |
| Financeiro isolado | ✅ `payment_access_permissions` + RLS |
| profiles_private SELECTs | ✅ Bloqueados via policy USING(false) - acesso via edge function |

---

## 15) Bloqueio de SELECT Direto em profiles_private

**Data de implementação:** 2026-01-27

**Política adicionada:**
```sql
CREATE POLICY "Deny direct selects on profiles_private"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (false);
```

**Motivo:**  
Garantir que dados PII criptografados só sejam acessíveis via caminhos controlados (edge functions) que implementam verificação adicional de autorização e auditoria.

**Caminhos de acesso válidos:**
1. Edge function `pii-crypto` (verifica admin + tenant membership)
2. RPC `get_profile_private_with_audit` (audita todo acesso)

**Controles existentes:**
- Criptografia AES-256-GCM de todos os campos sensíveis
- Edge function valida: autenticação → admin do tenant → usuário pertence ao tenant
- Grants temporais via `pii_access_permissions` com `expires_at` obrigatório
- Auditoria completa em `pii_audit_logs`

---

## 11) Exceção GABS (Internal Access)

**Data de implementação:** 2026-01-25

**Tenant ID:** `b2541db1-5029-4fb9-8d1c-870c2738e0d6`

**Função de bypass:**
```sql
public.has_gabs_bypass(_user_id)
-- Retorna TRUE se: super_admin + membro ativo do GABS
```

**Tabelas com bypass:**
- `profiles` - via `can_view_profile()`
- `shifts` - via `can_view_shift()`

**REMOVIDO do bypass (requer grant explícito):**
- `payments` - `has_payment_access()` agora requer grant em `payment_access_permissions`
- `profiles_private` - `has_pii_access()` requer grant em `pii_access_permissions`
- `shift_assignment_locations` - `has_gps_access()` requer grant em `gps_access_grants`

**Controles:**
- Requer AMBOS: super_admin E membership ativa no GABS (para profiles/shifts apenas)
- Para dados sensíveis (PII, pagamentos, GPS): grant temporal obrigatório
- Bypass é imutável (hardcoded tenant ID)

---

## 12) Grants Temporais (PII, Financeiro, GPS) - HARDENED v2

**Data de atualização:** 2026-01-29 (DOUBLE-CHECK: Role + Grant)

**Tabelas de grants:**
- `pii_access_permissions` - Acesso a dados pessoais criptografados
- `payment_access_permissions` - Acesso a dados financeiros
- `gps_access_grants` - Acesso a localização GPS

**Colunas obrigatórias:**
- `expires_at` - Data/hora de expiração do grant (**OBRIGATÓRIO**)
- `reason` - Justificativa obrigatória
- `tenant_id` - Isolamento por tenant
- `granted_by` - Quem concedeu

**Comportamento HARDENED v2 (2026-01-29):**
- ❌ Grant SEM `expires_at` = **REJEITADO** (constraint CHECK no banco)
- ❌ Grant com `expires_at` no passado = **IGNORADO**
- ❌ Super admins **NÃO TÊM BYPASS** - precisam de grant explícito
- ❌ has_gabs_bypass **NÃO FUNCIONA** para PII/pagamentos/GPS
- ❌ is_super_admin sozinho **NÃO FUNCIONA** para PII/pagamentos/GPS
- ✅ Usuários comuns **NUNCA** conseguem acesso mesmo com grant
- ✅ **REQUER AMBOS**: (admin OR super_admin) **E** grant temporal válido

**Funções de acesso (DUAL-AUTH):**
```sql
has_pii_access(_tenant_id) -- EXIGE (admin OR super_admin) E grant expires_at > now()
has_payment_access(_tenant_id) -- EXIGE (admin OR super_admin) E grant expires_at > now()
has_gps_access(_tenant_id) -- EXIGE (admin OR super_admin) E grant expires_at > now()
```

**Triggers de auditoria:**
```sql
log_pii_grant_trigger AFTER INSERT ON pii_access_permissions
log_payment_grant_trigger AFTER INSERT ON payment_access_permissions  
log_gps_grant_trigger AFTER INSERT ON gps_access_grants
-- Registra: granted_to, expires_at, reason em pii_audit_logs
```

---

## 13) Visibilidade de GPS (shift_assignment_locations)

**Data de implementação:** 2026-01-25

**Quem pode ver GPS:**
1. Próprio usuário - apenas shifts ativos (12h window)
2. Usuários com grant explícito em `gps_access_grants`

**Quem NÃO pode ver (REMOVIDO):**
- Tenant admins genéricos (removida política ampla)
- has_gabs_bypass (não funciona mais para GPS)

**Controles:**
- `has_gps_access()` valida grant + expires_at + tenant_id
- Acesso de admin via `get_assignment_location_with_audit()` é auditado
- Usuário vê próprio GPS apenas de plantões do dia ou com check-in/out nas últimas 12h

**Consentimento (requisito LGPD):**
- Plantonistas são informados sobre coleta de GPS nos Termos de Uso (página /terms)
- GPS só é coletado quando o setor tem "Exigir GPS" habilitado
- Usuário opta por fazer check-in (ação voluntária que aciona coleta)
- Admin deve informar verbalmente sobre política de GPS ao onboarding

**Justificativa legal:**
- Registro de ponto eletrônico é obrigação trabalhista (CLT, Portaria 671/2021)
- Coleta de localização para validar presença no local de trabalho é legítima

---

## 14) Visibilidade Restrita de Escalas

**Política:** `Authorized users can view shifts`

**Quem pode ver um shift:**
1. Admin do tenant
2. Usuário escalado (via `shift_assignments`)
3. Membro do setor do shift (via `sector_memberships`)
4. GABS bypass (apenas para shifts, não para dados sensíveis)

**Quem NÃO pode ver:**
- Outros usuários do tenant não relacionados
- Qualquer anon
- Qualquer cross-tenant

---

## Funções de Segurança Implementadas

| Função | Propósito |
|--------|-----------|
| `get_gabs_tenant_id()` | Retorna UUID do GABS (imutável) |
| `has_gabs_bypass(user_id)` | Verifica super_admin + GABS member (profiles/shifts apenas) |
| `can_view_profile(profile_id)` | Próprio OU admin OU bypass |
| `can_view_shift(shift_id, tenant_id)` | Escalado OU setor OU admin |
| `is_assigned_to_shift(shift_id, user_id)` | Verifica assignment |
| `has_pii_access(user_id, tenant_id)` | **DUAL-AUTH**: (admin OR super_admin) E grant temporal válido |
| `has_payment_access(user_id, tenant_id)` | **DUAL-AUTH**: (admin OR super_admin) E grant temporal válido |
| `has_gps_access(user_id, tenant_id)` | **DUAL-AUTH**: (admin OR super_admin) E grant temporal válido |
