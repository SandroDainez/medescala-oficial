# QA Release Checklist

Checklist final para validacao manual antes de liberar alteracoes operacionais.

## 1. Usuario mobile

- Login com usuario comum
- Troca de tenant, se aplicavel
- Puxar agenda para baixo e confirmar refresh sem logout
- Abrir notificacao de troca pelo sininho
- Abrir notificacao de candidatura pelo sininho
- Aceitar troca sem conflito
- Tentar aceitar troca com conflito real
- Verificar mensagem clara de conflito na agenda
- Candidatar-se a plantao sem conflito
- Candidatar-se a plantao com conflito
- Conferir historico de trocas e candidaturas

## 2. Admin operacional

- Abrir calendario do setor
- Criar plantao simples
- Editar plantao existente
- Replicar dia
- Copiar escala para outro mes
- Importar planilha valida
- Fazer bulk apply
- Fazer bulk edit
- Excluir um plantao
- Excluir escala do periodo
- Resolver conflito com justificativa
- Remover atribuicao em conflito
- Abrir e limpar historico de conflitos

## 3. Trocas e candidaturas

- Admin aprovar candidatura
- Admin rejeitar candidatura
- Admin aceitar oferta
- Admin rejeitar oferta
- Usuario receber refletido no historico e notificacoes

## 4. Regressao tecnica

- `npm run check:all`
- Conferir se `npm run audit:daily` continua executando
- Validar que `build` gerou PWA sem falhas

## 5. Evidencias minimas

Registrar antes da release:

- data da validacao
- ambiente validado
- usuario/admin utilizados
- fluxos testados
- falhas encontradas
- decisao final de liberacao
