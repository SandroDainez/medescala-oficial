import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalendarCheck, Copy, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { mascararToken, montarEnderecoDoCalendario } from '@/lib/assinaturaDoCalendario';

/**
 * Assinatura do calendário: o aparelho guarda um endereço e volta nele sozinho,
 * então a escala se mantém em dia sem ninguém importar nada de novo.
 *
 * O endereço é a credencial — o celular consulta de madrugada e não tem como
 * fazer login. Daí o botão de revogar: é o que transforma um link vazado em
 * link morto.
 */
export function AssinaturaDoCalendario() {
  const [token, setToken] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [girando, setGirando] = useState(false);
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);

  const carregarToken = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc('obter_token_de_calendario');
    setCarregando(false);

    if (error) {
      console.error('[AssinaturaDoCalendario] Erro ao obter endereço:', error);
      return;
    }
    setToken(data as string);
  }, []);

  useEffect(() => {
    carregarToken();
  }, [carregarToken]);

  const endereco = token
    ? montarEnderecoDoCalendario(import.meta.env.VITE_SUPABASE_URL as string, token)
    : null;

  const copiarEndereco = async () => {
    if (!endereco) return;
    try {
      await navigator.clipboard.writeText(endereco.https);
      toast.success('Endereço copiado. Trate-o como uma senha.');
    } catch {
      toast.error('Não foi possível copiar. Use o botão de adicionar ao calendário.');
    }
  };

  const girarToken = async () => {
    setGirando(true);
    const { data, error } = await (supabase as any).rpc('girar_token_de_calendario');
    setGirando(false);
    setConfirmandoTroca(false);

    if (error) {
      toast.error('Não foi possível gerar um endereço novo. Tente de novo.');
      return;
    }

    setToken(data as string);
    toast.success('Endereço novo criado. O anterior parou de funcionar agora.');
  };

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparando o endereço do seu calendário...
      </div>
    );
  }

  if (!endereco) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Não foi possível preparar o endereço do calendário agora.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Assinar no calendário do aparelho</p>
        <p className="text-sm text-muted-foreground">
          Seus plantões passam a aparecer no calendário do celular e se atualizam sozinhos
          quando a escala muda. Não é preciso importar nada de novo.
        </p>
      </div>

      <Button asChild className="w-full">
        {/* webcal:// é o que faz o sistema abrir o app de calendário, em vez de
            baixar um arquivo que o iPhone não sabe para onde mandar. */}
        <a href={endereco.webcal}>
          <CalendarCheck className="h-4 w-4 mr-2" />
          Adicionar ao calendário do aparelho
        </a>
      </Button>

      <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-xs text-muted-foreground">
            Este endereço é a sua senha: quem o tiver vê seus plantões, sem precisar entrar
            no app. Não compartilhe em grupos. Se suspeitar que vazou, gere outro aqui mesmo.
          </p>
        </div>

        <p className="font-mono text-xs break-all text-muted-foreground">
          {mascararToken(token!)}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copiarEndereco}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copiar endereço
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmandoTroca(true)}
            disabled={girando}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${girando ? 'animate-spin' : ''}`} />
            Gerar endereço novo
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmandoTroca} onOpenChange={setConfirmandoTroca}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar um endereço novo?</AlertDialogTitle>
            <AlertDialogDescription>
              O endereço atual para de funcionar na hora, e quem o tiver deixa de ver seus
              plantões. Os aparelhos que já assinaram vão parar de atualizar — você precisará
              adicionar o calendário de novo em cada um deles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={girando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); girarToken(); }} disabled={girando}>
              {girando ? 'Gerando...' : 'Gerar novo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
