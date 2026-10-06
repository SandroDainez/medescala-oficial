import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from '@/hooks/auth-context';
import { setTenantSelectionDoneSafe } from '@/hooks/tenant-context';
import type { Session, User } from '@supabase/supabase-js';
import { buildPublicAppUrl } from '@/lib/publicAppUrl';
import { resolverSessaoInicial } from '@/lib/authBoot';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // true quando não deu para confirmar a sessão (rede caída, lock travado).
  // Serve para avisar o usuário em vez de só jogá-lo na tela de login sem explicação.
  const [sessaoIndisponivel, setSessaoIndisponivel] = useState(false);

  useEffect(() => {
    let vivo = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!vivo) return;
        setSession(session);
        setUser(session?.user ?? null);
        setSessaoIndisponivel(false); // conseguimos falar com o auth
        setLoading(false);
      }
    );

    // THEN check for existing session.
    // Passa por resolverSessaoInicial porque getSession pode nunca resolver:
    // com token vencido e sem rede, a renovação segura o lock do storage e o
    // próprio getSession estoura (NavigatorLockAcquireTimeoutError). Com só um
    // .then(), o app ficava em "Carregando..." para sempre.
    void resolverSessaoInicial(() => supabase.auth.getSession()).then(
      ({ session, indisponivel }) => {
        if (!vivo) return;
        setSession(session);
        setUser(session?.user ?? null);
        setSessaoIndisponivel(indisponivel);
        setLoading(false); // sempre, aconteça o que acontecer
      },
    );

    // Quando o sinal volta, tenta de novo sozinho. Sem isto, o médico que saiu
    // do subsolo ficaria olhando o aviso até perceber que precisa recarregar.
    const aoVoltarARede = () => {
      void resolverSessaoInicial(() => supabase.auth.getSession()).then(
        ({ session, indisponivel }) => {
          if (!vivo) return;
          if (!indisponivel) {
            setSession(session);
            setUser(session?.user ?? null);
          }
          setSessaoIndisponivel(indisponivel);
        },
      );
    };
    window.addEventListener('online', aoVoltarARede);

    return () => {
      vivo = false;
      window.removeEventListener('online', aoVoltarARede);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const redirectUrl = buildPublicAppUrl('/');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name,
        },
      },
    });

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    // Make logout resilient on mobile/PWA where server session may already be gone.
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }

    // Always clear local auth state/storage.
    await supabase.auth.signOut({ scope: 'local' });

    // Clear app-specific tenant selection so next login starts clean.
    try {
      localStorage.removeItem('medescala_current_tenant');
    } catch {
      // ignore
    }
    setTenantSelectionDoneSafe(false);

    // Ensure UI updates immediately even if the auth event is delayed.
    setSession(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, sessaoIndisponivel, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
