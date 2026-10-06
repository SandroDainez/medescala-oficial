import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { callEdgeFunction } from '@/lib/edgeFetch';
import { parseDateOnly } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PALAVRA_DE_CONFIRMACAO = 'ENCERRAR';

type Previa = {
  nome: string;
  plantoesPassados: number;
  plantoesFuturos: number;
  plantoesFuturosDatas: { data: string; titulo: string; inicio: string | null }[];
  servicos: string[];
  impedimentos: string[];
  bloqueado?: boolean;
};

export default function DeleteAccount() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [palavra, setPalavra] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [encerrada, setEncerrada] = useState<{ futuros: number; passados: number } | null>(null);

  const carregarPrevia = useCallback(async () => {
    setCarregando(true);
    setErroPrevia(null);
    const { ok, data } = await callEdgeFunction('delete-own-account', {});
    setCarregando(false);

    if (!ok && !data?.bloqueado) {
      setErroPrevia(
        (data?.error as string) ?? 'Não foi possível carregar os dados da sua conta. Tente novamente.',
      );
      return;
    }
    setPrevia(data as unknown as Previa);
  }, []);

  useEffect(() => {
    if (!authLoading && user && !previa && !carregando && !erroPrevia && !encerrada) {
      void carregarPrevia();
    }
  }, [authLoading, user, previa, carregando, erroPrevia, encerrada, carregarPrevia]);

  const encerrar = async () => {
    setEncerrando(true);
    const { ok, data } = await callEdgeFunction('delete-own-account', { confirm: true });

    if (!ok) {
      setEncerrando(false);
      if (data?.bloqueado) {
        setPrevia(data as unknown as Previa);
        return;
      }
      toast({
        title: 'Não foi possível encerrar',
        description:
          (data?.error as string) ?? 'Nada foi alterado na sua conta. Tente novamente em alguns instantes.',
        variant: 'destructive',
      });
      return;
    }

    setEncerrada({
      futuros: Number(data?.plantoesFuturosMantidos ?? 0),
      passados: Number(data?.plantoesPassadosMantidos ?? 0),
    });
    setEncerrando(false);
    // Encerrou: a sessão não vale mais nada, então sai antes de liberar a tela.
    await signOut();
  };

  const cabecalho = (
    <div className="sticky top-0 z-10 border-b bg-background">
      <div className="container mx-auto flex items-center gap-4 px-4 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Encerrar minha conta</h1>
      </div>
    </div>
  );

  // ── Encerrada ─────────────────────────────────────────────────────────────
  if (encerrada) {
    return (
      <div className="min-h-screen bg-background">
        {cabecalho}
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Conta encerrada
              </CardTitle>
              <CardDescription>Seu acesso ao MedEscala foi removido.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>Seus dados pessoais — CPF, RG, endereço, dados bancários e PIX — foram apagados.</p>
              {encerrada.futuros > 0 && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-foreground">
                  {encerrada.futuros === 1
                    ? 'Atenção: você continua escalado em 1 plantão que ainda vai acontecer.'
                    : `Atenção: você continua escalado em ${encerrada.futuros} plantões que ainda vão acontecer.`}{' '}
                  A coordenação foi avisada de que você saiu do aplicativo, mas a escala não mudou.
                  Fale com ela se não for cumprir.
                </p>
              )}
              {encerrada.passados > 0 && (
                <p>
                  {encerrada.passados === 1
                    ? '1 plantão já realizado continua'
                    : `${encerrada.passados} plantões já realizados continuam`}{' '}
                  registrados na escala do serviço, com seu nome, para conferência de pagamento e
                  auditoria.
                </p>
              )}
              <p>
                Para voltar a usar o MedEscala, a coordenação do serviço precisa liberar seu acesso
                novamente.
              </p>
              <div className="pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/">Página inicial</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Sem login: explica e manda entrar ─────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        {cabecalho}
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Encerrar minha conta no MedEscala</CardTitle>
              <CardDescription>
                Você pode encerrar sua conta quando quiser, sem pedir autorização a ninguém.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>Para confirmar que a conta é sua, entre com seu login. Depois disso:</p>
              <ul className="list-disc space-y-1 pl-6">
                <li>seu acesso é removido na hora;</li>
                <li>seus dados pessoais (CPF, RG, endereço, dados bancários, PIX) são apagados;</li>
                <li>
                  a escala do serviço não muda — encerrar a conta é sair do aplicativo, não do
                  serviço, e plantões já marcados no seu nome continuam marcados;
                </li>
                <li>
                  plantões já realizados continuam registrados, com seu nome, para conferência de
                  pagamento e auditoria.
                </li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => navigate('/auth')}>Entrar para continuar</Button>
                <Button asChild variant="outline">
                  <Link to="/privacy">Política de privacidade</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Logado ────────────────────────────────────────────────────────────────
  const bloqueado = (previa?.impedimentos?.length ?? 0) > 0;
  const podeConfirmar = !!previa && !bloqueado && palavra.trim().toUpperCase() === PALAVRA_DE_CONFIRMACAO;

  return (
    <div className="min-h-screen bg-background">
      {cabecalho}
      <div className="container mx-auto max-w-2xl space-y-4 px-4 py-8">
        {carregando && (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Conferindo seus plantões antes de continuar...
            </CardContent>
          </Card>
        )}

        {erroPrevia && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-destructive">{erroPrevia}</p>
              <Button variant="outline" size="sm" onClick={() => void carregarPrevia()}>
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        )}

        {previa && bloqueado && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                Não é possível encerrar agora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {previa.impedimentos.map((motivo) => (
                <p key={motivo}>{motivo}</p>
              ))}
              <p>Resolva isso e volte aqui. Nada na sua conta foi alterado.</p>
            </CardContent>
          </Card>
        )}

        {previa && !bloqueado && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>O que acontece quando você confirmar</CardTitle>
                <CardDescription>
                  Leia com atenção: isso não pode ser desfeito por você nem pela coordenação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Seu acesso termina na hora.</strong> O login
                    é bloqueado e você deixa de receber avisos
                    {previa.servicos.length > 0 ? ` de ${previa.servicos.join(', ')}` : ''}.
                  </p>
                  <p>
                    <strong className="text-foreground">Seus dados pessoais são apagados:</strong>{' '}
                    CPF, RG, endereço, dados bancários, PIX e as notificações no seu aparelho.
                  </p>
                  <p>
                    <strong className="text-foreground">A escala do serviço não muda.</strong> Quem
                    monta a escala é a coordenação; encerrar a conta aqui é sair do aplicativo, não
                    do serviço.
                  </p>
                </div>

                {previa.plantoesFuturos > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="flex items-start gap-2 font-medium text-foreground">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      Encerrar a conta não cancela seus plantões
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      {previa.plantoesFuturos === 1
                        ? 'Você continua escalado em 1 plantão que ainda vai acontecer.'
                        : `Você continua escalado em ${previa.plantoesFuturos} plantões que ainda vão acontecer.`}{' '}
                      A escala é do serviço e não muda por aqui. A coordenação é avisada de que você
                      saiu do aplicativo — <strong className="text-foreground">fale com ela</strong>{' '}
                      se não for cumprir estes plantões, senão o setor fica sem ninguém no dia.
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {previa.plantoesFuturosDatas.slice(0, 8).map((p, i) => (
                        <li key={`${p.data}-${p.titulo}-${i}`}>
                          {format(parseDateOnly(p.data), 'dd/MM/yyyy', { locale: ptBR })}
                          {p.inicio ? ` às ${p.inicio.slice(0, 5)}` : ''} — {p.titulo}
                        </li>
                      ))}
                      {previa.plantoesFuturosDatas.length > 8 && (
                        <li>e mais {previa.plantoesFuturosDatas.length - 8}...</li>
                      )}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Depois de encerrar, você não enxerga mais esta lista no aplicativo.
                    </p>
                  </div>
                )}

                {previa.plantoesPassados > 0 && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {previa.plantoesPassados === 1
                        ? '1 plantão já realizado continua registrado'
                        : `${previa.plantoesPassados} plantões já realizados continuam registrados`}
                    </p>
                    <p className="mt-1">
                      Com seu nome, na escala e no financeiro do serviço. É o registro do trabalho
                      que você prestou, mantido para conferência de pagamento e auditoria — por isso
                      não é apagado junto. Veja a{' '}
                      <Link to="/privacy" className="underline">
                        política de privacidade
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-base">Confirmação</CardTitle>
                <CardDescription>
                  Para confirmar, escreva {PALAVRA_DE_CONFIRMACAO} no campo abaixo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="confirmacao">Escreva {PALAVRA_DE_CONFIRMACAO}</Label>
                  <Input
                    id="confirmacao"
                    value={palavra}
                    onChange={(e) => setPalavra(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder={PALAVRA_DE_CONFIRMACAO}
                    disabled={encerrando}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={!podeConfirmar || encerrando}
                    onClick={() => void encerrar()}
                  >
                    {encerrando ? 'Encerrando...' : 'Encerrar minha conta'}
                  </Button>
                  <Button variant="outline" onClick={() => navigate(-1)} disabled={encerrando}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
