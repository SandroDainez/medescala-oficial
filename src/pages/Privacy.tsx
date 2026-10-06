import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Política de Privacidade</h1>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none p-6 space-y-6">
            <p className="text-muted-foreground text-sm">
              Última atualização: outubro de 2026
            </p>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">1. Introdução</h2>
              <p className="text-muted-foreground leading-relaxed">
                O MedEscala ("nós", "nosso" ou "Aplicativo") está comprometido em proteger sua privacidade. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos suas informações pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">2. Dados Coletados</h2>
              <p className="text-muted-foreground leading-relaxed">
                Coletamos os seguintes tipos de dados:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li><strong>Dados de identificação:</strong> nome, e-mail, CPF, CRM</li>
                <li><strong>Dados de contato:</strong> telefone, endereço</li>
                <li><strong>Dados financeiros:</strong> informações bancárias para pagamentos</li>
                <li><strong>Dados de uso:</strong> registros de plantões, check-in/check-out</li>
                <li><strong>Dados de localização:</strong> quando autorizado, para validação de check-in</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">3. Finalidade do Tratamento</h2>
              <p className="text-muted-foreground leading-relaxed">
                Utilizamos seus dados para:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Gerenciar sua conta e autenticação</li>
                <li>Operar o sistema de escalas e plantões</li>
                <li>Processar pagamentos e gerar relatórios financeiros</li>
                <li>Validar presença através de geolocalização (quando autorizado)</li>
                <li>Enviar notificações sobre plantões e trocas</li>
                <li>Melhorar nossos serviços e experiência do usuário</li>
                <li>Cumprir obrigações legais e regulatórias</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">4. Base Legal</h2>
              <p className="text-muted-foreground leading-relaxed">
                O tratamento de dados é realizado com base em:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Execução de contrato (prestação do serviço)</li>
                <li>Consentimento (para dados sensíveis e geolocalização)</li>
                <li>Cumprimento de obrigação legal</li>
                <li>Legítimo interesse (melhorias no serviço)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">5. Compartilhamento de Dados</h2>
              <p className="text-muted-foreground leading-relaxed">
                Seus dados podem ser compartilhados com:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Administradores da sua organização/hospital</li>
                <li>Prestadores de serviços essenciais (hospedagem, processamento)</li>
                <li>Autoridades quando exigido por lei</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                Não vendemos ou compartilhamos seus dados com terceiros para fins de marketing.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">6. Segurança dos Dados</h2>
              <p className="text-muted-foreground leading-relaxed">
                Implementamos medidas técnicas e organizacionais para proteger seus dados:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Criptografia de dados sensíveis em trânsito e em repouso</li>
                <li>Controle de acesso baseado em funções</li>
                <li>Monitoramento e auditoria de acessos</li>
                <li>Backups regulares</li>
                <li>Políticas de segurança para colaboradores</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">7. Retenção de Dados e Encerramento da Conta</h2>
              <p className="text-muted-foreground leading-relaxed">
                Você pode encerrar sua conta quando quiser, sem depender de autorização: pelo aplicativo,
                em Configurações, ou pela página{' '}
                <a href="https://app.medescalas.com.br/excluir-conta" className="underline">
                  app.medescalas.com.br/excluir-conta
                </a>
                , que funciona mesmo sem o aplicativo instalado.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                <strong className="text-foreground">Ao encerrar a conta, apagamos imediatamente</strong> seus
                dados pessoais de identificação e pagamento: CPF, RG, CRM, RQE, telefone, endereço, dados
                bancários e chave PIX, além das preferências e dos registros de notificação do seu aparelho.
                Seu acesso é bloqueado na mesma hora.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                <strong className="text-foreground">O que permanece, e por quê:</strong> os registros de
                plantões realizados — data, horário, setor e o seu nome — continuam na escala e no financeiro
                do serviço contratante. Eles são o comprovante do trabalho prestado e são necessários para
                conferência de pagamento, prestação de contas e eventual fiscalização. Esses registros
                pertencem também à instituição que contratou o MedEscala, e por isso não são apagados a
                pedido individual. Nós os mantemos por <strong className="text-foreground">5 anos</strong>{' '}
                contados do encerramento, prazo compatível com a guarda de documentos trabalhistas e fiscais,
                após o que são anonimizados.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                As posições de localização registradas nos check-ins são mantidas enquanto o plantão
                correspondente permanecer no financeiro, pela mesma finalidade de comprovação, e não são
                usadas para qualquer outro fim.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Encerrar a conta significa deixar de usar o aplicativo — não cancela plantões já marcados
                nem desliga você do serviço. Quem organiza a escala é a coordenação da instituição, que é
                avisada do encerramento.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">8. Seus Direitos</h2>
              <p className="text-muted-foreground leading-relaxed">
                Conforme a LGPD, você tem direito a:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Confirmar a existência de tratamento de dados</li>
                <li>Acessar seus dados pessoais</li>
                <li>Corrigir dados incompletos ou desatualizados</li>
                <li>Solicitar anonimização ou eliminação de dados desnecessários</li>
                <li>Solicitar portabilidade dos dados</li>
                <li>Revogar consentimento a qualquer momento</li>
                <li>Solicitar informações sobre compartilhamento</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">9. Cookies e Tecnologias</h2>
              <p className="text-muted-foreground leading-relaxed">
                Utilizamos cookies e tecnologias similares para manter sua sessão, lembrar preferências e melhorar a experiência. Você pode gerenciar cookies através das configurações do seu navegador.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">10. Alterações na Política</h2>
              <p className="text-muted-foreground leading-relaxed">
                Podemos atualizar esta Política periodicamente. Notificaremos sobre mudanças significativas através do aplicativo ou e-mail. Recomendamos revisar esta página regularmente.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">11. Contato</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para exercer seus direitos ou esclarecer dúvidas sobre esta Política, entre em contato conosco através dos canais oficiais de suporte disponíveis no aplicativo.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">12. Encarregado de Dados (DPO)</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para questões relacionadas à proteção de dados, você pode contatar nosso Encarregado de Dados através dos canais de suporte do aplicativo.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
