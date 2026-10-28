import { describe, it, expect } from 'vitest';
import { mascararToken, montarEnderecoDoCalendario } from './assinaturaDoCalendario';

const TOKEN = 'c3279951cb58410899f815ddd9ee4a1584c701464dae49d0949e4baeb08182c9';

describe('montarEnderecoDoCalendario', () => {
  it('monta os dois endereços do mesmo arquivo', () => {
    const e = montarEnderecoDoCalendario('https://abc.supabase.co', TOKEN);
    expect(e.https).toBe(`https://abc.supabase.co/functions/v1/calendario-plantoes?chave=${TOKEN}`);
    expect(e.webcal).toBe(`webcal://abc.supabase.co/functions/v1/calendario-plantoes?chave=${TOKEN}`);
  });

  it('webcal é o que faz o celular assinar em vez de baixar', () => {
    const e = montarEnderecoDoCalendario('https://abc.supabase.co', TOKEN);
    expect(e.webcal.startsWith('webcal://')).toBe(true);
    expect(e.webcal).not.toContain('https://');
  });

  it('não gera barra dupla quando a base termina em barra', () => {
    const e = montarEnderecoDoCalendario('https://abc.supabase.co/', TOKEN);
    expect(e.https).not.toContain('.co//');
  });

  it('escapa o token, para caractere estranho não cortar o endereço', () => {
    const e = montarEnderecoDoCalendario('https://abc.supabase.co', 'a b&c=d');
    expect(e.https).toContain('chave=a%20b%26c%3Dd');
  });
});

describe('mascararToken', () => {
  it('esconde o miolo, que é o que não pode vazar numa captura de tela', () => {
    const m = mascararToken(TOKEN);
    expect(m).toContain('c327');
    expect(m).toContain('82c9');
    expect(m).not.toContain(TOKEN.slice(8, 40));
    expect(m.length).toBeLessThan(TOKEN.length);
  });

  it('token curto some inteiro, em vez de aparecer quase todo', () => {
    expect(mascararToken('abc123')).toBe('••••••');
  });
});
