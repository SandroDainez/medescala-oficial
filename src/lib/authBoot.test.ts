import { describe, it, expect, vi } from 'vitest';
import { resolverSessaoInicial, semConexao, TEMPO_LIMITE_SESSAO_MS } from './authBoot';
import type { Session } from '@supabase/supabase-js';

const sessaoFake = { access_token: 'tok', user: { id: 'u1' } } as unknown as Session;

const nunca = () => new Promise<never>(() => {});

describe('resolverSessaoInicial', () => {
  it('devolve a sessão quando getSession responde', async () => {
    const r = await resolverSessaoInicial(async () => ({ data: { session: sessaoFake } }));
    expect(r.session).toBe(sessaoFake);
    expect(r.indisponivel).toBe(false);
  });

  it('sem sessão salva, não é indisponibilidade — é só não estar logado', async () => {
    const r = await resolverSessaoInicial(async () => ({ data: { session: null } }));
    expect(r.session).toBeNull();
    expect(r.indisponivel).toBe(false);
  });

  it('não rejeita quando getSession estoura (NavigatorLockAcquireTimeoutError)', async () => {
    const r = await resolverSessaoInicial(async () => {
      throw new Error('Acquiring an exclusive Navigator LockManager lock timed out waiting 10000ms');
    });
    expect(r.session).toBeNull();
    expect(r.indisponivel).toBe(true);
  });

  it('não rejeita quando a rede cai (Failed to fetch)', async () => {
    const r = await resolverSessaoInicial(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r.indisponivel).toBe(true);
  });

  it('BLOQUEADOR: getSession que nunca resolve não trava a abertura', async () => {
    vi.useFakeTimers();
    try {
      const promessa = resolverSessaoInicial(nunca, 8000);
      await vi.advanceTimersByTimeAsync(8000);
      const r = await promessa;
      expect(r.session).toBeNull();
      expect(r.indisponivel).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('erro COM sessão em mãos ainda vale: o médico entra', async () => {
    const r = await resolverSessaoInicial(async () => ({
      data: { session: sessaoFake },
      error: { message: 'falha ao renovar token' },
    }));
    expect(r.session).toBe(sessaoFake);
    expect(r.indisponivel).toBe(false);
  });

  it('erro SEM sessão é indisponibilidade', async () => {
    const r = await resolverSessaoInicial(async () => ({
      data: { session: null },
      error: { message: 'Failed to fetch' },
    }));
    expect(r.indisponivel).toBe(true);
  });

  it('resposta malformada não quebra', async () => {
    // @ts-expect-error — simula resposta fora do contrato
    const r = await resolverSessaoInicial(async () => ({}));
    expect(r.session).toBeNull();
    expect(r.indisponivel).toBe(false);
  });

  it('resposta rápida não espera o prazo inteiro', async () => {
    vi.useFakeTimers();
    try {
      const promessa = resolverSessaoInicial(async () => ({ data: { session: sessaoFake } }), 8000);
      await vi.advanceTimersByTimeAsync(0);
      await expect(promessa).resolves.toEqual({ session: sessaoFake, indisponivel: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('o prazo padrão é generoso o bastante para 3G ruim, mas finito', () => {
    expect(TEMPO_LIMITE_SESSAO_MS).toBeGreaterThanOrEqual(5000);
    expect(TEMPO_LIMITE_SESSAO_MS).toBeLessThanOrEqual(15000);
  });
});

describe('semConexao', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('acusa offline quando o aparelho diz offline', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
      writable: true,
    });
    expect(semConexao()).toBe(true);
  });

  it('não acusa offline quando o aparelho diz online', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });
    expect(semConexao()).toBe(false);
  });

  it('sem navigator (servidor), não afirma offline', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(semConexao()).toBe(false);
  });
});
