import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConviteDeServico {
  id: string;
  tenant_id: string;
  tenant_nome: string;
  role: string;
  criado_em: string;
}

/**
 * O médico que já tem conta só entra em um novo serviço se ele mesmo aceitar.
 * A coordenação registra o convite; o vínculo nasce aqui, dentro da sessão do
 * dono da conta — é o que impede um admin de anexar a conta de um colega.
 */
export function ConvitesDeServico() {
  const { user } = useAuth();
  const { refreshMemberships } = useTenant();
  const [convites, setConvites] = useState<ConviteDeServico[]>([]);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [adiado, setAdiado] = useState(false);

  const carregar = useCallback(async () => {
    if (!user?.id) {
      setConvites([]);
      return;
    }

    const { data, error } = await (supabase as any).rpc('listar_meus_convites_de_servico');

    if (error) {
      console.error('[ConvitesDeServico] Erro ao carregar convites:', error);
      return;
    }

    setConvites((data ?? []) as ConviteDeServico[]);
  }, [user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function responder(convite: ConviteDeServico, aceitar: boolean) {
    setRespondendo(convite.id);

    const { error } = await (supabase as any).rpc('responder_convite_de_servico', {
      _convite_id: convite.id,
      _aceitar: aceitar,
    });

    setRespondendo(null);

    if (error) {
      toast.error(aceitar ? 'Não foi possível aceitar o convite.' : 'Não foi possível recusar o convite.');
      return;
    }

    setConvites((atual) => atual.filter((c) => c.id !== convite.id));

    if (aceitar) {
      // Sem isso o serviço novo não aparece no seletor até o próximo login.
      await refreshMemberships();
      toast.success(`Você agora faz parte de ${convite.tenant_nome}.`);
      return;
    }

    toast.success('Convite recusado.');
  }

  const convite = convites[0];
  if (!convite || adiado) return null;

  const ehAdmin = convite.role === 'admin' || convite.role === 'owner';

  return (
    // Fechar só adia: ninguém é obrigado a decidir na hora, e o convite volta
    // na próxima abertura do app até ser aceito ou recusado.
    <Dialog open onOpenChange={(aberto) => { if (!aberto) setAdiado(true); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Convite de serviço
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{convite.tenant_nome}</span> quer adicionar
            você {ehAdmin ? 'como administrador' : 'à escala'}, usando a conta que você já tem.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Aceitando, você passa a ver a escala desse serviço com este mesmo login. Seus plantões nos
          outros serviços continuam como estão. Se não reconhece o convite, recuse.
        </p>

        {convites.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Há mais {convites.length - 1} convite(s) depois deste.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={respondendo === convite.id}
            onClick={() => responder(convite, false)}
          >
            Recusar
          </Button>
          <Button disabled={respondendo === convite.id} onClick={() => responder(convite, true)}>
            {respondendo === convite.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aceitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
