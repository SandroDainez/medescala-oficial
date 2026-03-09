# Auditoria Autônoma Diária

Este projeto agora possui auditoria automática diária com execução manual opcional.

## O que é verificado

- Disponibilidade das rotas principais do app (`/`, `/admin`, `/admin/financial`, etc.).
- Consistência de escalas futuras:
  - plantão sem setor,
  - duplicidade de atribuição ativa (mesmo usuário/plantão),
  - atribuição com valor negativo,
  - atribuição ativa sem nome de usuário.
- Qualidade de configuração financeira:
  - valores individuais duplicados por usuário/setor/mês/ano,
  - receitas duplicadas por setor/mês/ano,
  - receitas/despesas negativas,
  - metadados contábeis inválidos.
- Alerta quando admin/super admin aparece em atribuição ativa.

## Arquivos

- Workflow: `.github/workflows/daily-audit.yml`
- Script: `scripts/audit/run-audit.mjs`
- Comando manual local: `npm run audit:daily`

## Execução automática

A auditoria roda diariamente via GitHub Actions (`cron: 09:30 UTC`) e também por acionamento manual (`workflow_dispatch`).

## Configuração de secrets (GitHub)

Configure os secrets no repositório:

- `AUDIT_APP_URL` (ex: `https://app.medescalas.com.br`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUDIT_WEBHOOK_URL` (opcional, para notificação em webhook)

## Como funcionam os alertas

- Sempre gera artefatos em `audit-results/` (`latest-audit.json` e `latest-audit.md`).
- Se houver falhas críticas:
  - o workflow falha,
  - uma issue de incidente é criada/atualizada: `[Audit Diário] Falhas críticas detectadas`.
- Se não houver falhas críticas:
  - a issue aberta é fechada automaticamente.

## Rodar manualmente no GitHub

1. Acesse `Actions` no repositório.
2. Abra workflow `Daily Site Audit`.
3. Clique em `Run workflow`.

