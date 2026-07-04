import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Chama um edge function do Supabase via fetch nativo.
 *
 * Diferença em relação a supabase.functions.invoke: erros HTTP (4xx/5xx)
 * não são embrulhados em FunctionsHttpError — o corpo JSON da resposta
 * fica sempre acessível em `data`, incluindo `data.error` com a mensagem real.
 */
export async function callEdgeFunction(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    // corpo não era JSON — mantém objeto vazio
  }

  return { ok: response.ok, data };
}
