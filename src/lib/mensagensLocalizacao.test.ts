import { describe, it, expect } from 'vitest';
import {
  MENSAGEM_ERRO_GENERICO,
  MENSAGEM_TEMPO_ESGOTADO,
  mensagemLocalizacaoIndisponivel,
  mensagemPermissaoNegada,
  ondeLiberarLocalizacao,
  type Plataforma,
} from './mensagensLocalizacao';

const TODAS: Plataforma[] = ['ios', 'android', 'web'];

describe('mensagens de localização', () => {
  it('no aplicativo instalado NUNCA fala em navegador', () => {
    // Era o defeito: no iPhone a tela mandava "habilite nas configurações do
    // seu navegador", e o médico ia procurar um navegador que não existe ali.
    for (const p of ['ios', 'android'] as Plataforma[]) {
      const textos = [
        mensagemPermissaoNegada(p),
        mensagemLocalizacaoIndisponivel(p),
        ondeLiberarLocalizacao(p),
      ];
      for (const t of textos) {
        expect(t.toLowerCase()).not.toContain('navegador');
      }
    }
  });

  it('no iPhone aponta o caminho real dos Ajustes', () => {
    const t = mensagemPermissaoNegada('ios');
    expect(t).toContain('Ajustes do iPhone');
    expect(t).toContain('MedEscala');
  });

  it('no Android aponta o caminho real das Configurações', () => {
    const t = mensagemPermissaoNegada('android');
    expect(t).toContain('Configurações do aparelho');
    expect(t).toContain('Permissões');
  });

  it('na web continua falando em navegador, que ali existe', () => {
    expect(ondeLiberarLocalizacao('web')).toContain('navegador');
  });

  it('toda mensagem diz o que fazer, não só o que deu errado', () => {
    for (const p of TODAS) {
      expect(mensagemPermissaoNegada(p)).toMatch(/tente de novo|libere/i);
    }
    expect(MENSAGEM_TEMPO_ESGOTADO).toMatch(/tente de novo/i);
    expect(MENSAGEM_ERRO_GENERICO).toMatch(/tente de novo/i);
  });

  it('a de tempo esgotado explica o caso do hospital, que é onde acontece', () => {
    expect(MENSAGEM_TEMPO_ESGOTADO).toContain('área fechada');
  });

  it('nenhuma mensagem repete a mesma instrução duas vezes', () => {
    // A tela antiga mostrava "Por favor, habilite..." duas vezes seguidas.
    for (const p of TODAS) {
      const t = mensagemPermissaoNegada(p);
      const ocorrencias = (t.match(/libere o acesso/gi) ?? []).length;
      expect(ocorrencias).toBe(1);
    }
  });

  it('não sobrou "Por favor" empilhado', () => {
    for (const p of TODAS) {
      const t = mensagemPermissaoNegada(p);
      expect((t.match(/por favor/gi) ?? []).length).toBeLessThanOrEqual(1);
    }
  });
});
