import { describe, it, expect } from 'vitest';
import {
  faixaParaUsuarios,
  descreverFaixa,
  percentualDeUso,
  proximaFaixa,
  vagasRestantes,
  type PlanoDisponivel,
} from './planoDoServico';

// As faixas reais do MedEscala.
const PLANOS: PlanoDisponivel[] = [
  { id: 'trial', name: 'Teste Gratuito (3 usuários)', min_users: 1, max_users: 3, price_monthly: 0 },
  { id: 'p20', name: 'Plano 1-20 usuários', min_users: 1, max_users: 20, price_monthly: 200 },
  { id: 'p50', name: 'Plano 21-50 usuários', min_users: 21, max_users: 50, price_monthly: 400 },
  { id: 'p100', name: 'Plano 51-100 usuários', min_users: 51, max_users: 100, price_monthly: 600 },
  { id: 'p150', name: 'Plano 101-150 usuários', min_users: 101, max_users: 150, price_monthly: 700 },
  { id: 'p200', name: 'Plano 151-200 usuários', min_users: 151, max_users: 200, price_monthly: 1200 },
  { id: 'pmax', name: 'Plano 201+ usuários', min_users: 201, max_users: 999999, price_monthly: 2000 },
];

describe('proximaFaixa', () => {
  it('aponta a faixa seguinte de cada limite', () => {
    expect(proximaFaixa(PLANOS, 3)?.id).toBe('p20');
    expect(proximaFaixa(PLANOS, 20)?.id).toBe('p50');
    expect(proximaFaixa(PLANOS, 50)?.id).toBe('p100');
    expect(proximaFaixa(PLANOS, 150)?.id).toBe('p200');
    expect(proximaFaixa(PLANOS, 200)?.id).toBe('pmax');
  });

  it('na última faixa não há próxima', () => {
    expect(proximaFaixa(PLANOS, 999999)).toBeNull();
  });

  it('nunca aponta o teste gratuito como destino de quem já passou de 3', () => {
    // Mesma regra do banco: acima de 3 usuários o plano de teste deixa de valer.
    expect(proximaFaixa(PLANOS, 3)?.id).not.toBe('trial');
    expect(proximaFaixa(PLANOS, 20)?.id).not.toBe('trial');
  });

  it('acompanha o banco: é sempre o MENOR plano que comporta um usuário a mais', () => {
    const faixa = proximaFaixa(PLANOS, 20);
    expect(faixa?.max_users).toBe(50);
    expect(faixa?.price_monthly).toBe(400);
  });

  it('não quebra com lista vazia nem com limite ausente', () => {
    expect(proximaFaixa([], 20)).toBeNull();
    expect(proximaFaixa(PLANOS, null)?.id).toBe('trial');
  });
});

describe('faixaParaUsuarios', () => {
  it('devolve a menor faixa que comporta o serviço', () => {
    expect(faixaParaUsuarios(PLANOS, 1)?.id).toBe('trial');
    expect(faixaParaUsuarios(PLANOS, 4)?.id).toBe('p20');
    expect(faixaParaUsuarios(PLANOS, 20)?.id).toBe('p20');
    expect(faixaParaUsuarios(PLANOS, 21)?.id).toBe('p50');
    expect(faixaParaUsuarios(PLANOS, 117)?.id).toBe('p150');
  });

  it('flagra os dois serviços que ficaram presos numa faixa cara', () => {
    // 117 usuários estavam no plano de 201+ (R$ 2.000) e 1 usuário no de
    // 101-150 (R$ 700), porque a tela só deixava subir de plano.
    expect(faixaParaUsuarios(PLANOS, 117)?.price_monthly).toBe(700);
    expect(faixaParaUsuarios(PLANOS, 1)?.price_monthly).toBe(0);
  });

  it('serviço sem nenhum usuário cabe na menor faixa, não em nenhuma', () => {
    expect(faixaParaUsuarios(PLANOS, 0)?.id).toBe('trial');
  });
});

describe('percentualDeUso', () => {
  it('mede o uso da faixa', () => {
    expect(percentualDeUso(10, 20)).toBe(50);
    expect(percentualDeUso(0, 20)).toBe(0);
  });

  it('não passa de 100 nem divide por zero', () => {
    expect(percentualDeUso(30, 20)).toBe(100);
    expect(percentualDeUso(5, 0)).toBe(0);
    expect(percentualDeUso(null, null)).toBe(0);
  });
});

describe('vagasRestantes', () => {
  it('conta o que ainda cabe na faixa', () => {
    expect(vagasRestantes(17, 20)).toBe(3);
  });

  it('nunca é negativo', () => {
    expect(vagasRestantes(25, 20)).toBe(0);
  });
});

describe('descreverFaixa', () => {
  it('escreve a faixa como o hospital lê', () => {
    expect(descreverFaixa(1, 20)).toBe('1 a 20 usuários');
    expect(descreverFaixa(201, 999999)).toBe('201+ usuários');
    expect(descreverFaixa(3, 3)).toBe('3 usuários');
  });
});
