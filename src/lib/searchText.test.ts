import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchText } from './searchText';

describe('normalizeSearchText', () => {
  it('remove acentos, maiúsculas e espaços extras', () => {
    expect(normalizeSearchText('  MÁRIO   JUSTINIANO ARAUZ ')).toBe('mario justiniano arauz');
    expect(normalizeSearchText('VIVIANE INÊS NAHAS')).toBe('viviane ines nahas');
    expect(normalizeSearchText(null)).toBe('');
  });
});

describe('matchesSearch', () => {
  const usuario = ['MÁRIO JUSTINIANO ARAUZ', 'wariojustiniano@outlook.com', '13999999999'];

  it('acha nome acentuado digitando sem acento (caso real do cadastro "não salvo")', () => {
    expect(matchesSearch(usuario, 'mario')).toBe(true);
    expect(matchesSearch(usuario, 'MARIO JUSTINIANO')).toBe(true);
    expect(matchesSearch(['FLÁVIO DE ANGELIS'], 'flavio')).toBe(true);
    expect(matchesSearch(['ANDRÉ CARLOS MILANEZ DE CASTRO'], 'andre castro')).toBe(true);
  });

  it('palavras em qualquer ordem e em campos diferentes', () => {
    expect(matchesSearch(usuario, 'arauz mario')).toBe(true);
    expect(matchesSearch(usuario, 'mario outlook')).toBe(true);
  });

  it('também acha digitando COM acento', () => {
    expect(matchesSearch(usuario, 'mário')).toBe(true);
  });

  it('termo vazio não filtra; termo inexistente não casa', () => {
    expect(matchesSearch(usuario, '   ')).toBe(true);
    expect(matchesSearch(usuario, 'joao')).toBe(false);
    expect(matchesSearch([], 'mario')).toBe(false);
  });

  it('busca por e-mail e telefone continua funcionando', () => {
    expect(matchesSearch(usuario, 'wariojustiniano@outlook.com')).toBe(true);
    expect(matchesSearch(usuario, '139999')).toBe(true);
  });
});
