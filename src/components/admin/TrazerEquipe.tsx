import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeSearchText } from '@/lib/searchText';

type Situacao = 'disponivel' | 'ja_no_servico' | 'convite_pendente';

interface ServicoQueAdministro {
  tenant_id: string;
  nome: string;
}

interface PessoaDaEquipe {
  user_id: string;
  nome: string | null;
  email: string | null;
  nunca_acessou: boolean;
  situacao: Situacao;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  onConcluido: () => void | Promise<void>;
}

const ROTULO_DA_SITUACAO: Record<Exclude<Situacao, 'disponivel'>, string> = {
  ja_no_servico: 'Já está neste serviço',
  convite_pendente: 'Convite já enviado',
};

/**
 * Montar um serviço novo com a equipe de outro serviço do mesmo coordenador.
 * A origem só pode ser um serviço que ELE administra — são pessoas que ele já
 * enxerga hoje, então a tela não revela nenhum e-mail novo.
 */
export function TrazerEquipe({ open, onOpenChange, tenantId, onConcluido }: Props) {
  const [servicos, setServicos] = useState<ServicoQueAdministro[]>([]);
  const [origem, setOrigem] = useState<string>('');
  const [equipe, setEquipe] = useState<PessoaDaEquipe[]>([]);
  const [carregandoEquipe, setCarregandoEquipe] = useState(false);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;

    setOrigem('');
    setEquipe([]);
    setMarcados(new Set());
    setBusca('');

    (async () => {
      const { data, error } = await (supabase as any).rpc('listar_servicos_que_administro');

      if (error) {
        console.error('[TrazerEquipe] Erro ao listar serviços:', error);
        toast.error('Não foi possível listar os serviços que você administra.');
        return;
      }

      setServicos(((data ?? []) as ServicoQueAdministro[]).filter((s) => s.tenant_id !== tenantId));
    })();
  }, [open, tenantId]);

  const carregarEquipe = useCallback(
    async (origemEscolhida: string) => {
      if (!tenantId || !origemEscolhida) return;

      setCarregandoEquipe(true);
      setMarcados(new Set());

      const { data, error } = await (supabase as any).rpc('listar_equipe_para_convidar', {
        _origem: origemEscolhida,
        _destino: tenantId,
      });

      setCarregandoEquipe(false);

      if (error) {
        console.error('[TrazerEquipe] Erro ao listar equipe:', error);
        toast.error('Não foi possível carregar a equipe desse serviço.');
        setEquipe([]);
        return;
      }

      setEquipe((data ?? []) as PessoaDaEquipe[]);
    },
    [tenantId],
  );

  const equipeFiltrada = useMemo(() => {
    const termo = normalizeSearchText(busca.trim());
    if (!termo) return equipe;

    return equipe.filter((pessoa) =>
      normalizeSearchText(`${pessoa.nome ?? ''} ${pessoa.email ?? ''}`).includes(termo),
    );
  }, [equipe, busca]);

  const disponiveisFiltrados = useMemo(
    () => equipeFiltrada.filter((p) => p.situacao === 'disponivel'),
    [equipeFiltrada],
  );

  const todosMarcados =
    disponiveisFiltrados.length > 0 && disponiveisFiltrados.every((p) => marcados.has(p.user_id));

  function alternar(userId: string) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(userId)) proximo.delete(userId);
      else proximo.add(userId);
      return proximo;
    });
  }

  function alternarTodos() {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      for (const pessoa of disponiveisFiltrados) {
        if (todosMarcados) proximo.delete(pessoa.user_id);
        else proximo.add(pessoa.user_id);
      }
      return proximo;
    });
  }

  async function trazer() {
    if (!tenantId || !origem || marcados.size === 0) return;

    setEnviando(true);

    const { data, error } = await (supabase as any).rpc('convidar_equipe', {
      _origem: origem,
      _destino: tenantId,
      _user_ids: Array.from(marcados),
    });

    setEnviando(false);

    if (error) {
      console.error('[TrazerEquipe] Erro ao trazer equipe:', error);
      toast.error('Não foi possível trazer essas pessoas.');
      return;
    }

    const resultados = (data ?? []) as { pessoa: string; resultado: string }[];
    const convidados = resultados.filter((r) => r.resultado === 'convidado').length;
    const adicionados = resultados.filter((r) => r.resultado === 'adicionado').length;

    const partes: string[] = [];
    if (adicionados > 0) partes.push(`${adicionados} ${adicionados === 1 ? 'adicionada' : 'adicionadas'} à escala`);
    if (convidados > 0) partes.push(`${convidados} ${convidados === 1 ? 'aguarda aceite' : 'aguardam aceite'}`);

    toast.success(partes.length > 0 ? partes.join(' • ') : 'Nada a trazer com esta seleção.');

    await onConcluido();
    await carregarEquipe(origem);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Trazer de outra escala
          </DialogTitle>
          <DialogDescription>
            Escolha um serviço que você administra e marque quem deve entrar também neste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Serviço de origem</Label>
            <Select
              value={origem}
              onValueChange={(v) => { setOrigem(v); carregarEquipe(v); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha o serviço" />
              </SelectTrigger>
              <SelectContent>
                {servicos.map((servico) => (
                  <SelectItem key={servico.tenant_id} value={servico.tenant_id}>
                    {servico.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {servicos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Você não administra nenhum outro serviço.
              </p>
            )}
          </div>

          {carregandoEquipe ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando a equipe...
            </div>
          ) : origem ? (
            <>
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
              />

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="font-medium text-primary disabled:opacity-50"
                  onClick={alternarTodos}
                  disabled={disponiveisFiltrados.length === 0}
                >
                  {todosMarcados ? 'Desmarcar todos' : `Marcar todos (${disponiveisFiltrados.length})`}
                </button>
                <span className="text-muted-foreground">{marcados.size} selecionado(s)</span>
              </div>

              <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border p-2">
                {equipeFiltrada.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Ninguém encontrado.
                  </p>
                )}

                {equipeFiltrada.map((pessoa) => {
                  const bloqueado = pessoa.situacao !== 'disponivel';

                  return (
                    <label
                      key={pessoa.user_id}
                      className={`flex items-start gap-2 rounded-md p-2 ${
                        bloqueado ? 'opacity-60' : 'cursor-pointer hover:bg-accent/60'
                      }`}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={marcados.has(pessoa.user_id)}
                        disabled={bloqueado}
                        onCheckedChange={() => alternar(pessoa.user_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {pessoa.nome || pessoa.email}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {pessoa.email}
                          {bloqueado && ` • ${ROTULO_DA_SITUACAO[pessoa.situacao]}`}
                          {!bloqueado && pessoa.nunca_acessou && ' • entra direto (nunca acessou)'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Quem já usa o app recebe um convite e entra quando aceitar. Quem nunca acessou entra
                direto na escala.
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Fechar
          </Button>
          <Button onClick={trazer} disabled={marcados.size === 0 || enviando}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Trazer {marcados.size > 0 ? marcados.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
