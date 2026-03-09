# Auditoria Diária - MedEscala

- Executado em: 2026-03-07T07:56:43.424Z
- Status: **FAILED**
- Erros críticos: **7**
- Alertas: **0**

## Métricas


## Verificação de Rotas

- FALHA / (erro)
- FALHA /auth (erro)
- FALHA /admin (erro)
- FALHA /admin/financial (erro)
- FALHA /admin/sectors (erro)
- FALHA /user/shifts (erro)

## Achados

1. [CRITICAL] APP_ROUTE_FETCH_FAILED - Falha ao acessar rota /
   - contexto: {"url":"https://app.medescalas.com.br/","error":"fetch failed"}
2. [CRITICAL] APP_ROUTE_FETCH_FAILED - Falha ao acessar rota /auth
   - contexto: {"url":"https://app.medescalas.com.br/auth","error":"fetch failed"}
3. [CRITICAL] APP_ROUTE_FETCH_FAILED - Falha ao acessar rota /admin
   - contexto: {"url":"https://app.medescalas.com.br/admin","error":"fetch failed"}
4. [CRITICAL] APP_ROUTE_FETCH_FAILED - Falha ao acessar rota /admin/financial
   - contexto: {"url":"https://app.medescalas.com.br/admin/financial","error":"fetch failed"}
5. [CRITICAL] APP_ROUTE_FETCH_FAILED - Falha ao acessar rota /admin/sectors
   - contexto: {"url":"https://app.medescalas.com.br/admin/sectors","error":"fetch failed"}
6. [CRITICAL] APP_ROUTE_FETCH_FAILED - Falha ao acessar rota /user/shifts
   - contexto: {"url":"https://app.medescalas.com.br/user/shifts","error":"fetch failed"}
7. [CRITICAL] MISSING_SUPABASE_CONFIG - SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes. Auditoria de dados não executada.
   - contexto: {"hasSupabaseUrl":false,"hasServiceRoleKey":false}
