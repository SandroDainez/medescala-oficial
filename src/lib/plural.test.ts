import { describe, it, expect } from 'vitest';
import { contar, plantoes, plural } from './plural';

describe('plural', () => {
  it('1 fica no singular, o resto no plural', () => {
    expect(plural(1, 'plantão', 'plantões')).toBe('plantão');
    expect(plural(2, 'plantão', 'plantões')).toBe('plantões');
    expect(plural(0, 'plantão', 'plantões')).toBe('plantões');
  });

  it('zero usa plural, como se fala em português', () => {
    expect(plantoes(0)).toBe('0 plantões');
  });

  it('nunca produz "plantãoões", que era o defeito antigo', () => {
    for (let n = 0; n <= 20; n++) {
      expect(plantoes(n)).not.toContain('plantãoões');
    }
  });

  it('nunca produz "plantão(ões)", que aparecia nas capturas da loja', () => {
    for (let n = 0; n <= 20; n++) {
      expect(plantoes(n)).not.toContain('(ões)');
    }
  });

  it('contar junta número e palavra', () => {
    expect(contar(1, 'troca', 'trocas')).toBe('1 troca');
    expect(contar(4, 'troca', 'trocas')).toBe('4 trocas');
  });

  it('negativo usa o módulo — -1 ainda é singular', () => {
    expect(plural(-1, 'plantão', 'plantões')).toBe('plantão');
  });
});
