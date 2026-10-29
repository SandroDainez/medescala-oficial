import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/edgeFetch';
import { buildPublicAppUrl } from '@/lib/publicAppUrl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, MailCheck, Printer, Send, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  INTERVALO_ENTRE_ENVIOS_MS,
  resumoDoEnvio,
  selecionarDestinatarios,
  tempoEstimado,
  type ModoDeEnvio,
  type ProfissionalParaConvite,
  type ResultadoDoEnvio,
} from '@/lib/conviteEmMassa';
import {
  tabelaParaCsv,
  tabelaParaHtmlDeImpressao,
  type TabelaDoRelatorio,
} from '@/lib/relatorios/tabelaDoRelatorio';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  tenantName: string | null;
  profissionais: ProfissionalParaConvite[];
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ConviteEmMassa({ open, onOpenChange, tenantId, tenantName, profissionais }: Props) {
  const [modo, setModo] = useState<ModoDeEnvio>('nunca_acessaram');
  const [acessou, setAcessou] = useState<Set<string> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<ResultadoDoEnvio[] | null>(null);
  const cancelado = useRef(false);

  const carregarAcessos = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await (supabase as any).rpc('listar_status_de_acesso', { _tenant_id: tenantId });

    if (error) {
      console.error('[ConviteEmMassa] Erro ao ler status de acesso:', error);
      // Sem esse dado não dá para separar os grupos. Melhor assumir que
      // ninguém acessou do que mandar convite para quem já usa o app: o modo
      // padrão fica inofensivo e o administrador escolhe conscientemente.
      setAcessou(new Set());
      return;
    }

    const jaAcessaram = (data ?? [])
      .filter((r: any) => !r.nunca_acessou)
      .map((r: any) => r.user_id as string);

    setAcessou(new Set(jaAcessaram));
  }, [tenantId]);

  useEffect(() => {
    if (open) {
      setResultados(null);
      setProgresso(0);
      cancelado.current = false;
      carregarAcessos();
    }
  }, [open, carregarAcessos]);

  const selecao = useMemo(
    () => selecionarDestinatarios(profissionais, acessou ?? new Set(), modo),
    [profissionais, acessou, modo],
  );

  const tabelaDoResultado = useMemo<TabelaDoRelatorio | null>(() => {
    if (!resultados) return null;

    const linhas = resultados.map((r) => [r.nome, r.email, r.enviado ? 'Enviado' : 'Falhou', r.erro ?? '']);
    const foraDoEnvio = selecao.foraDoEnvio.map((f) => [f.nome, '', 'Não enviado', f.motivo]);

    return {
      titulo: 'Envio de convites',
      totalDeLinhas: linhas.length + foraDoEnvio.length,
      secoes: [
        { titulo: 'Convites enviados', colunas: ['Nome', 'E-mail', 'Situação', 'Observação'], linhas },
        { titulo: 'Fora do envio', colunas: ['Nome', 'E-mail', 'Situação', 'Motivo'], linhas: foraDoEnvio },
      ],
    };
  }, [resultados, selecao.foraDoEnvio]);

  async function enviar() {
    if (!tenantId || selecao.destinatarios.length === 0) return;

    setEnviando(true);
    setProgresso(0);
    cancelado.current = false;

    const loginUrl = buildPublicAppUrl('/auth');
    const redirectUrl = buildPublicAppUrl('/reset-password');
    const saida: ResultadoDoEnvio[] = [];

    for (let i = 0; i < selecao.destinatarios.length; i += 1) {
      if (cancelado.current) break;

      const alvo = selecao.destinatarios[i];
      const { ok, data } = await callEdgeFunction('send-invite-email', {
        name: alvo.nome,
        email: alvo.email,
        hospitalName: tenantName || 'MedEscala',
        loginUrl,
        redirectUrl,
        tenantId,
        sendEmail: true,
      });

      saida.push({
        nome: alvo.nome,
        email: alvo.email,
        enviado: Boolean(ok && !data?.error),
        erro: !ok || data?.error ? ((data?.error as string) || 'Falha no envio') : undefined,
      });

      setProgresso(i + 1);

      // O provedor recusa rajada: sem respiro, a maioria voltaria com erro de
      // limite e o administrador veria "falhou" em quem estava correto.
      if (i < selecao.destinatarios.length - 1) {
        await esperar(INTERVALO_ENTRE_ENVIOS_MS);
      }
    }

    setEnviando(false);
    setResultados(saida);

    const enviados = saida.filter((r) => r.enviado).length;
    if (enviados === 0) toast.error(resumoDoEnvio(saida));
    else if (enviados < saida.length) toast.warning(resumoDoEnvio(saida));
    else toast.success(resumoDoEnvio(saida));
  }

  function baixarRelatorio() {
    if (!tabelaDoResultado) return;
    const csv = tabelaParaCsv(tabelaDoResultado);
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `convites_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function imprimirRelatorio() {
    if (!tabelaDoResultado) return;
    const janela = window.open('', '_blank');
    if (!janela) {
      toast.error('O navegador bloqueou a janela de impressão.');
      return;
    }
    janela.document.write(
      tabelaParaHtmlDeImpressao(tabelaDoResultado, {
        emitidoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      }),
    );
    janela.document.close();
    janela.focus();
    janela.print();
  }

  const total = selecao.destinatarios.length;
  const carregando = acessou === null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar convites em massa</DialogTitle>
          <DialogDescription>
            Cada pessoa recebe o mesmo convite do envio individual, com um link próprio de
            primeiro acesso.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Conferindo quem já acessou o app...
          </div>
        ) : resultados ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">{resumoDoEnvio(resultados)}</p>

            {resultados.some((r) => !r.enviado) && (
              <div className="rounded-lg border p-3 max-h-48 overflow-y-auto space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Não foram enviados:</p>
                {resultados.filter((r) => !r.enviado).map((r) => (
                  <p key={r.email} className="text-xs">
                    <span className="font-medium">{r.nome}</span> — {r.erro}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={baixarRelatorio}>
                <Table2 className="h-4 w-4 mr-2" />
                Baixar relatório
              </Button>
              <Button variant="outline" size="sm" onClick={imprimirRelatorio}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </div>
        ) : enviando ? (
          <div className="space-y-3 py-2">
            <p className="text-sm">
              Enviando {progresso} de {total}...
            </p>
            <Progress value={(progresso / Math.max(total, 1)) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Mantenha esta tela aberta até o fim. Fechar agora interrompe o envio.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Quem vai receber</Label>
              <RadioGroup value={modo} onValueChange={(v) => setModo(v as ModoDeEnvio)}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="nunca_acessaram" id="modo-novos" className="mt-1" />
                  <Label htmlFor="modo-novos" className="font-normal cursor-pointer">
                    Só quem nunca acessou o app
                    <span className="block text-xs text-muted-foreground">
                      Quem já entrou alguma vez fica de fora.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="todos" id="modo-todos" className="mt-1" />
                  <Label htmlFor="modo-todos" className="font-normal cursor-pointer">
                    Todos os profissionais ativos
                    <span className="block text-xs text-muted-foreground">
                      Quem já usa o app também recebe um link de nova senha.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {total === 0
                  ? 'Ninguém a convidar com esta opção.'
                  : `${total} ${total === 1 ? 'pessoa vai receber' : 'pessoas vão receber'} o convite.`}
              </p>
              {total > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  O envio leva {tempoEstimado(total)}, um de cada vez.
                </p>
              )}
              {selecao.foraDoEnvio.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selecao.foraDoEnvio.length}{' '}
                  {selecao.foraDoEnvio.length === 1 ? 'pessoa fica' : 'pessoas ficam'} de fora
                  (sem e-mail, inativas ou já com acesso).
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {resultados ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : enviando ? (
            <Button variant="outline" onClick={() => { cancelado.current = true; }}>
              Interromper
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={total === 0 || carregando}>
                <MailCheck className="h-4 w-4 mr-2" />
                Enviar {total > 0 ? `${total} ` : ''}convites
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
