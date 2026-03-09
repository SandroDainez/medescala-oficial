# Plano de Melhorias

## P0

- Revisar todas as consultas críticas para garantir filtro explícito por `tenant_id` e `user_id`.
  Impacto: evita vazamento de dados e inconsistência entre usuários.
  Status: parcialmente corrigido em [src/pages/user/Shifts.tsx](/Users/sandrodainez/Projetos/produtos/medescala-oficial/src/pages/user/Shifts.tsx).

- Consolidar o fluxo de troca obrigatória de senha em uma única rota e uma única implementação.
  Impacto: reduz regressões de navegação e divergência de comportamento.
  Status: rota canônica definida em `/change-password`; alias legado mantido em `/trocar-senha`.

- Fechar QA dos fluxos mobile de trocas, notificações, conflitos e atualização por pull-to-refresh.
  Impacto: corrige os casos operacionais já reportados por usuários.

- Garantir validações duplicadas em frontend e banco para trocas e candidaturas.
  Impacto: evita erro tardio ao aprovar e melhora previsibilidade de regra.

## P1

- Migrar leituras operacionais para uma camada de serviços por domínio.
  Escopo inicial:
  - `src/services/swaps`
  - `src/services/offers`
  - `src/services/notifications`
  - `src/services/schedule`
  Impacto: reduz lógica duplicada em páginas e melhora testabilidade.

- Padronizar uso de React Query para dados assíncronos.
  Escopo inicial:
  - `src/pages/user/Home.tsx`
  - `src/pages/user/Shifts.tsx`
  - `src/pages/user/AvailableShifts.tsx`
  - `src/pages/user/Swaps.tsx`
  Impacto: melhora cache, invalidação e consistência de estado.

- Criar testes automatizados para fluxos críticos.
  Cobertura mínima:
  - login e onboarding
  - troca de plantão
  - candidatura de plantão
  - aprovação admin
  - conflito de escala
  Impacto: reduz regressões em produção.

- Centralizar geração e interpretação de deep-links de notificações.
  Status: helper criado em [src/lib/notificationNavigation.ts](/Users/sandrodainez/Projetos/produtos/medescala-oficial/src/lib/notificationNavigation.ts).
  Próximo passo: cobrir admin e testes.

## P2

- Quebrar arquivos muito grandes em componentes, hooks e utilitários menores.
  Maiores alvos:
  - [src/components/admin/ShiftCalendar.tsx](/Users/sandrodainez/Projetos/produtos/medescala-oficial/src/components/admin/ShiftCalendar.tsx)
  - [src/components/admin/UserManagement.tsx](/Users/sandrodainez/Projetos/produtos/medescala-oficial/src/components/admin/UserManagement.tsx)
  - [src/pages/SuperAdmin.tsx](/Users/sandrodainez/Projetos/produtos/medescala-oficial/src/pages/SuperAdmin.tsx)
  Impacto: melhora manutenção, revisão e isolamento de bugs.

- Reduzir uso de `any` e casts sobre dados do Supabase.
  Impacto: aumenta segurança de tipos e reduz erro silencioso.

- Unificar explicação de conflitos entre admin e usuário.
  Objetivo: fonte única de conflito explicado com data, local, setor e motivo.

- Revisar script de auditoria para caminhos e roles atuais.
  Impacto: evita falsos positivos e gaps de monitoramento.

## P3

- Melhorar documentação técnica do sistema.
  Conteúdo mínimo:
  - arquitetura
  - entidades principais
  - multi-tenant
  - RPCs e edge functions críticas
  - regras de permissão

- Adicionar observabilidade de frontend e backend.
  Itens:
  - captura de exceções
  - logs estruturados
  - auditoria de ações críticas

- Refinar design das telas operacionais.
  Foco:
  - conflitos com mais contexto
  - tabelas com colunas estáveis
  - estados vazios mais úteis
  - mobile com hierarquia visual mais clara

## Bugs Possíveis

- Consultas sem escopo completo por `tenant_id` e `user_id`.
- Divergência entre rota obrigatória e rota opcional de troca de senha.
- Realtime inconsistente em notificações e telas de agenda.
- Falhas tardias em trocas/candidaturas por validação distribuída.
- Regressões em arquivos muito grandes com estado local excessivo.

## Funcionalidades Faltando

- Testes end-to-end.
- Permissões administrativas granulares.
- MFA para perfis administrativos.
- Observabilidade de produção.
- Histórico operacional padronizado em todas as áreas.
- Documentação de manutenção e onboarding.

