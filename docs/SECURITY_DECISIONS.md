# Decisões de Segurança (Riscos Aceitos)

Este projeto tem alguns alertas recorrentes na área de Segurança que são **intencionais** devido às necessidades operacionais do sistema.

## 1) Admin precisa ver dados pessoais de usuários do próprio tenant
- **Motivo**: gestão de funcionários (cadastro, contato, documentos e dados para pagamento).
- **Regra aplicada**: o acesso é restrito a administradores do mesmo tenant (nunca público).
- **Nota**: este risco existe se uma conta de admin for comprometida; mitigação recomendada é MFA e auditoria de acessos.

## 2) Admin precisa ver pagamentos (salários/valores) do tenant
- **Motivo**: criar/editar/excluir pagamentos e fechar períodos.
- **Regra aplicada**: administradores do tenant podem **ver** e **gerenciar** pagamentos; usuários comuns veem apenas os próprios.

## Observações
- Estes itens devem permanecer como **risco aceito** (não é bug).
- Se a política de negócio mudar, revise as permissões e registre uma nova decisão aqui.
