import { describe, expect, it } from 'vitest';
import { chunk, fetchAllPages } from './supabasePaging';

function fakeServer(total: number, maxRows: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows, rows.length);
    return { data: rows.slice(from, end), error: null };
  };
  return { fetchPage, calls };
}

describe('fetchAllPages', () => {
  it('traz tudo além do limite de 1.000 linhas do servidor', async () => {
    const { fetchPage } = fakeServer(1110, 1000);
    const { data, error } = await fetchAllPages(fetchPage);
    expect(error).toBeNull();
    expect(data).toHaveLength(1110);
    expect(data[1109]).toEqual({ id: 1109 });
  });

  it('funciona se o servidor limitar a menos que o tamanho de página', async () => {
    const { fetchPage } = fakeServer(2500, 400);
    const { data } = await fetchAllPages(fetchPage, 1000);
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it('total múltiplo exato do tamanho de página', async () => {
    const { fetchPage } = fakeServer(2000, 1000);
    const { data } = await fetchAllPages(fetchPage);
    expect(data).toHaveLength(2000);
  });

  it('lista vazia', async () => {
    const { fetchPage, calls } = fakeServer(0, 1000);
    const { data } = await fetchAllPages(fetchPage);
    expect(data).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('propaga erro com o que já tinha vindo', async () => {
    let n = 0;
    const { data, error } = await fetchAllPages(async () => {
      n++;
      return n === 1 ? { data: [{ id: 1 }], error: null } : { data: null, error: new Error('falhou') };
    }, 1);
    expect(data).toEqual([{ id: 1 }]);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('chunk', () => {
  it('divide em lotes', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
