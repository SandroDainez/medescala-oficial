# Publicação nas lojas — tudo que os formulários pedem

Levantado a partir do código e do banco em 06/10/2026. Onde houver divergência
entre este documento e o app, o app manda — avise para eu corrigir aqui.

A conta de demonstração para os revisores está em `docs/conta-demo.local.md`
(fora do git).

---

## 1. Identidade do app

| Campo | Valor |
|---|---|
| Nome | MedEscala |
| Identificador (bundle / package) | `com.medescala.app` |
| Site | https://app.medescalas.com.br |
| Política de privacidade | https://app.medescalas.com.br/privacy |
| Termos de uso | https://app.medescalas.com.br/terms |
| Exclusão de conta (link exigido pelo Google) | https://app.medescalas.com.br/excluir-conta |
| E-mail de suporte | medescala@hotmail.com |
| Telefone de suporte | (13) 99700-0649 |
| Categoria | Produtividade (alternativa: Medicina / Negócios) |
| Classificação indicativa | Livre — não há conteúdo sensível, compras, anúncios ou interação pública |
| Idioma | Português (Brasil) |

**Monetização:** nenhuma compra dentro do app. A assinatura é contratada pela
instituição, fora do aplicativo. Portanto **não** declarar compras no app e
**não** usar In-App Purchase. Se um dia houver cobrança do médico dentro do app,
a Apple passa a exigir o pagamento por ela.

---

## 2. Dados coletados — formulário do Google e Privacidade do App da Apple

Conferido tabela por tabela no banco de produção.

| Dado | Coletado? | Finalidade | Obrigatório? | Compartilhado? | Observação |
|---|---|---|---|---|---|
| Nome | sim | funcionamento do app | sim | não | aparece na escala do serviço |
| E-mail | sim | login e avisos | sim | não | |
| CPF | sim | identificação e pagamento | não | não | **criptografado** no banco |
| RG | sim | identificação | não | não | criptografado |
| CRM e RQE | sim | identificação profissional | não | não | criptografado |
| Telefone | sim | contato da coordenação | não | não | criptografado |
| Endereço | sim | cadastro e pagamento | não | não | criptografado |
| Dados bancários e PIX | sim | pagamento dos plantões | não | não | criptografado |
| Foto de perfil | sim | identificação visual | não | não | |
| Currículo (arquivo) | sim | cadastro profissional | não | não | |
| Localização aproximada e precisa | sim | **só no momento do check-in e do check-out** | não | não | guardamos apenas latitude e longitude daquele instante; não há rastreamento contínuo nem em segundo plano |
| Registros de plantão (data, hora, setor, valor) | sim | funcionamento e pagamento | sim | não | |
| Identificador do aparelho para notificação | sim | avisos de escala e troca | não | não | apagado ao encerrar a conta |

**Respostas-chave dos formulários:**

- Os dados são **criptografados em trânsito**: sim (HTTPS).
- Os dados sensíveis são **criptografados em repouso**: sim (colunas `_enc`).
- Há **venda ou compartilhamento com terceiros**: não.
- Há **publicidade ou rastreamento para anúncios**: não.
- O usuário pode **pedir a exclusão da conta**: sim, pelo app e por link na web.
- Há **coleta de dados de crianças**: não; o app é de uso profissional.

**Localização — como responder quando perguntarem a justificativa:**
"O app registra a posição apenas no instante em que o profissional faz o
check-in ou o check-out do plantão, para comprovar que esteve no local de
trabalho. Não há coleta em segundo plano nem acompanhamento contínuo. O recurso
é opcional e configurado por setor pela instituição contratante."

---

## 3. Exclusão de conta — o que a Apple e o Google vão conferir

- **Dentro do app:** Configurações → Encerrar minha conta.
- **Na web, sem instalar:** https://app.medescalas.com.br/excluir-conta
- **O que é apagado na hora:** CPF, RG, CRM, RQE, telefone, endereço, dados
  bancários, PIX, preferências e registros de notificação. Login bloqueado.
- **O que é retido, e por quê:** os plantões já realizados, com o nome, por 5
  anos, como comprovante de trabalho prestado para conferência de pagamento e
  fiscalização. Declarado na seção 7 da política de privacidade.

---

## 4. Texto da ficha

### Nome curto (até 30 caracteres)
`MedEscala — Escala Médica`

### Descrição curta (até 80 caracteres, Google)
`Escala de plantões médicos, trocas e check-in no local de trabalho.`

### Descrição completa

> O MedEscala organiza a escala de plantões de hospitais, clínicas e grupos de
> médicos — e põe na mão de cada profissional a sua própria agenda.
>
> **Para o profissional**
> • Veja seus plantões do mês em um calendário claro, com setor, horário e valor
> • Faça check-in e check-out no início e no fim do plantão
> • Solicite trocas de plantão e acompanhe a resposta
> • Receba avisos de escala publicada, troca e plantão disponível
> • Leve seus plantões para o calendário do celular
> • Acompanhe o quanto já trabalhou e quanto tem a receber
>
> **Para a coordenação**
> • Monte a escala por setor e publique para a equipe
> • Importe escalas prontas de planilha
> • Veja conflitos de quem está escalado em dois lugares ao mesmo tempo
> • Controle valores por plantão, por setor e por profissional
> • Acompanhe o fechamento financeiro do mês e exporte relatórios
> • Confira os check-ins, com local e horário
>
> O MedEscala é contratado pela instituição. O profissional recebe o acesso da
> coordenação e usa o aplicativo sem nenhum custo — não há compras dentro do app.
>
> Precisa de ajuda? medescala@hotmail.com

### Novidades desta versão (primeira publicação)
`Primeira versão do MedEscala para celular: sua escala de plantões, check-in no local e trocas, na palma da mão.`

---

## 5. Capturas de tela

Pastas: `docs/capturas/ios/` e `docs/capturas/android/`.

Tamanhos obrigatórios:
- **Apple:** iPhone 6,9" (1320×2868 ou 1290×2796) — mínimo 3, até 10.
  Se o app aceitar iPad, também 13" (2064×2752).
- **Google:** telefone, mínimo 2, até 8, entre 320 e 3840 px de lado.

Telas sugeridas, nesta ordem: calendário do mês → meus plantões com check-in →
troca de plantão → financeiro do profissional → visão da coordenação.

---

## 6. O que ainda depende de conta paga

| | |
|---|---|
| Google Play Console | US$ 25, uma vez. **Conta nova exige teste fechado com 12 testadores por 14 dias seguidos** antes de liberar produção |
| Apple Developer | US$ 99/ano |
| Android Studio | necessário na máquina para gerar o `.aab` |
| Universal Links | precisa do Team ID da Apple para o `apple-app-site-association` |
| Chaves de assinatura | criadas dentro de cada conta |
