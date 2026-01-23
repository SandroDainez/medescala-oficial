import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Termos de Uso</h1>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none p-6 space-y-6">
            <p className="text-muted-foreground text-sm">
              Última atualização: Janeiro de 2024
            </p>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">1. Aceitação dos Termos</h2>
              <p className="text-muted-foreground leading-relaxed">
                Ao acessar e utilizar o aplicativo MedEscala ("Aplicativo"), você concorda em cumprir e estar vinculado a estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar o Aplicativo.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">2. Descrição do Serviço</h2>
              <p className="text-muted-foreground leading-relaxed">
                O MedEscala é uma plataforma de gestão de escalas e plantões médicos que permite:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Gerenciamento de escalas de trabalho</li>
                <li>Registro de check-in e check-out de plantões</li>
                <li>Solicitação e aprovação de trocas de plantão</li>
                <li>Acompanhamento financeiro de plantões realizados</li>
                <li>Comunicação entre profissionais e administradores</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">3. Cadastro e Conta</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para utilizar o Aplicativo, você deve criar uma conta fornecendo informações verdadeiras, atuais e completas. Você é responsável por manter a confidencialidade de sua senha e por todas as atividades realizadas em sua conta.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">4. Uso Adequado</h2>
              <p className="text-muted-foreground leading-relaxed">
                Você concorda em utilizar o Aplicativo apenas para fins legais e de acordo com estes Termos. Você não deve:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                <li>Violar qualquer lei ou regulamento aplicável</li>
                <li>Fornecer informações falsas ou enganosas</li>
                <li>Interferir no funcionamento do Aplicativo</li>
                <li>Acessar áreas não autorizadas do sistema</li>
                <li>Compartilhar sua conta com terceiros</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">5. Propriedade Intelectual</h2>
              <p className="text-muted-foreground leading-relaxed">
                Todo o conteúdo do Aplicativo, incluindo textos, gráficos, logotipos, ícones e software, é propriedade do MedEscala ou de seus licenciadores e está protegido por leis de direitos autorais e propriedade intelectual.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">6. Limitação de Responsabilidade</h2>
              <p className="text-muted-foreground leading-relaxed">
                O MedEscala não se responsabiliza por quaisquer danos diretos, indiretos, incidentais ou consequenciais decorrentes do uso ou impossibilidade de uso do Aplicativo. O serviço é fornecido "como está", sem garantias de qualquer tipo.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">7. Modificações</h2>
              <p className="text-muted-foreground leading-relaxed">
                Reservamo-nos o direito de modificar estes Termos a qualquer momento. As alterações entrarão em vigor imediatamente após a publicação. O uso continuado do Aplicativo após as modificações constitui aceitação dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">8. Encerramento</h2>
              <p className="text-muted-foreground leading-relaxed">
                Podemos encerrar ou suspender sua conta a qualquer momento, sem aviso prévio, por violação destes Termos ou por qualquer outro motivo que julgarmos necessário.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">9. Contato</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para dúvidas sobre estes Termos de Uso, entre em contato conosco através do aplicativo ou pelos canais oficiais de suporte.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">10. Lei Aplicável</h2>
              <p className="text-muted-foreground leading-relaxed">
                Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será submetida ao foro da comarca de sua sede.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
