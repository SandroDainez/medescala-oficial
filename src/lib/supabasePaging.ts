// Paginação de consultas ao Supabase — padrão do app para qualquer lista que possa crescer.
//
// O PostgREST do projeto devolve NO MÁXIMO 1.000 linhas por requisição (max_rows) e corta
// o resto em silêncio, sem erro. Com vários setores, um mês passou de 1.000 plantões e o
// calendário deixou de mostrar os últimos dias (a linha 1.000 caía em 29/09 07:00).
//
// Regras:
// - Toda consulta paginada precisa de ordem ESTÁVEL e única (terminar em .order('id')),
//   senão linhas podem repetir ou sumir entre páginas. Vale também para RPC que retorna
//   tabela: supabase.rpc(...).order('id').range(from, to).
// - O avanço usa a quantidade realmente recebida, então funciona mesmo se o limite do
//   servidor for menor que o tamanho de página pedido.

export const SUPABASE_PAGE_SIZE = 1000;

export interface PagedResult<T> {
  data: T[];
  error: unknown | null;
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<PagedResult<T>> {
  const all: T[] = [];
  let from = 0;
  // Limite de segurança contra laço infinito (100 mil páginas).
  for (let guard = 0; guard < 100_000; guard++) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) {
      // Pode ser a última página ou um limite do servidor menor que pageSize:
      // confirma com mais uma requisição a partir do que já veio.
      from += rows.length;
      const next = await fetchPage(from, from + pageSize - 1);
      if (next.error) return { data: all, error: next.error };
      const nextRows = next.data ?? [];
      if (nextRows.length === 0) break;
      all.push(...nextRows);
      from += nextRows.length;
      continue;
    }
    from += rows.length;
  }
  return { data: all, error: null };
}

/** Divide uma lista de ids em lotes (evita URL gigante em .in()). */
export function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
