import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { semConexao } from '@/lib/authBoot';

/**
 * Faixa de aviso quando o app está sem conexão ou não conseguiu confirmar a sessão.
 *
 * Existe porque, sem rede, o app antes ficava preso em "Carregando..." para
 * sempre. Agora ele abre — e precisa dizer por que as coisas não carregam, em
 * vez de mostrar telas vazias ou jogar o usuário no login sem explicação.
 */
export default function AvisoSemConexao() {
  const { sessaoIndisponivel } = useAuth();
  const [offline, setOffline] = useState(() => semConexao());

  useEffect(() => {
    const aoFicarOnline = () => setOffline(false);
    const aoFicarOffline = () => setOffline(true);
    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);
    return () => {
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
    };
  }, []);

  if (!offline && !sessaoIndisponivel) return null;

  // Offline é diagnóstico certo; sessão indisponível com o aparelho "online"
  // costuma ser wi-fi de hospital sem saída, servidor fora ou rede muito lenta.
  const mensagem = offline
    ? 'Sem conexão. Os plantões podem estar desatualizados e nada que você fizer agora será salvo.'
    : 'Não foi possível falar com o servidor. Verifique sua conexão — nada que você fizer agora será salvo.';

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-200 backdrop-blur"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{mensagem}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded border border-amber-400/40 px-2 py-0.5 underline-offset-2 hover:bg-amber-500/20"
      >
        Tentar de novo
      </button>
    </div>
  );
}
