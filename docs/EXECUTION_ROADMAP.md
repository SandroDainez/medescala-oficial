# Roadmap de Fechamento

Este documento consolida o plano final para encerrar a rodada de refatoracao operacional do projeto sem voltar a atacar problemas isolados.

## Objetivo

Fechar a estabilizacao dos fluxos criticos, reduzir o risco tecnico do calendario admin e deixar um caminho claro para manutencao, QA e continuidade.

## O que ja foi concluido

### Fluxos criticos de operacao

- Navegacao contextual de notificacoes para `Trocas`, `Historico` e `Candidaturas`.
- Ajustes de troca de plantao no mobile, incluindo erro de aceite e mensagens de conflito.
- Pull-to-refresh na agenda do usuario sem necessidade de logout.
- Explicacao mais clara de conflitos para usuario e historicos mais completos para admin.
- Unificacao do fluxo de troca obrigatoria de senha.

### Organizacao por dominio

- `userOffers`, `userSwaps`, `userNotifications`
- `adminOffers`, `adminSwaps`
- `adminScheduleData`, `adminAssignments`, `adminShifts`, `adminConflicts`
- `adminBulkEdit`

### Calendario admin

O `ShiftCalendar` passou a delegar grande parte de:

- persistencia de plantoes
- persistencia de atribuicoes
- copia e replicacao
- importacao
- resolucao e historico de conflitos
- exclusao de escalas/plantoes
- aceitacao e rejeicao de ofertas
- bulk apply
- bulk edit

## Fase final recomendada

### Fase 1: Encerrar o `ShiftCalendar`

Objetivo: transformar o componente em orquestrador de UI.

Tarefas:

- extrair `useAdminShiftCalendarBulkEdit`
- extrair `useAdminShiftCalendarConflicts`
- extrair `useAdminShiftCalendarDialogs`
- separar subcomponentes visuais do calendario

Critero de saida:

- `ShiftCalendar.tsx` deixar de concentrar a maior parte dos branches operacionais

### Fase 2: Fechar a padronizacao de servicos

Objetivo: remover acesso direto a banco dos fluxos principais.

Tarefas:

- revisar paginas admin e user em busca de queries diretas restantes
- padronizar formato de erro/throw nos servicos
- centralizar helpers de mensagens, tags de status e movimentos

Critero de saida:

- telas deixam de falar com Supabase diretamente nos casos operacionais centrais

### Fase 3: Fechar verificacao e QA

Objetivo: garantir que os refactors nao virem regressao silenciosa.

Tarefas:

- usar `npm run check:core` como gate minimo
- manter checklist funcional para:
  - notificacoes
  - trocas
  - candidaturas
  - conflitos
  - calendario admin
  - mobile/PWA

Observacao:

O projeto ainda nao possui um runner de testes dedicado instalado. No estado atual do ambiente, o gate minimo automatizado consolidado e `lint + build`.

### Fase 4: Fechar documentacao tecnica

Objetivo: permitir continuidade sem redescoberta.

Tarefas:

- atualizar arquitetura real do frontend
- documentar dominios extraidos
- documentar fluxo principal do calendario admin
- documentar criterio de validacao manual por perfil

## Comando de verificacao

```bash
npm run check:core
```

## Resultado esperado ao final

- menos risco operacional em escalas, trocas e candidaturas
- calendario admin mais administravel
- verificacao tecnica minima padronizada
- documentacao suficiente para continuidade sem retrabalho
