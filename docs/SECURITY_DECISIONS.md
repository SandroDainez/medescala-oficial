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

## Resumo de Segurança (2026-01-25)

| Categoria | Status |
|-----------|--------|
| Acesso anônimo bloqueado | ✅ 30 tabelas com RESTRICTIVE TO anon |
| RLS habilitada + forçada | ✅ Todas as tabelas |
| Isolamento de tenant | ✅ Via `is_tenant_member()` e `is_tenant_admin()` |
| GPS auditing | ✅ `gps_access_logs` + view segura |
| PII isolado | ✅ `profiles_private` com criptografia + `pii_access_permissions` |
| Financeiro isolado | ✅ `payment_access_permissions` + RLS |
