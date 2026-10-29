import { describe, it, expect } from 'vitest';
import {
  resumoDoEnvio,
  selecionarDestinatarios,
  tempoEstimado,
  type ProfissionalParaConvite,
} from './conviteEmMassa';

const p = (over: Partial<ProfissionalParaConvite> & { user_id: string }): ProfissionalParaConvite => ({
  email: `${over.user_id}@exemplo.com`,
  full_name: null,
  name: null,
  active: true,
  ...over,
});

describe('selecionarDestinatarios', () => {
  it('no modo padrão, só quem nunca acessou', () => {
    const lista = [p({ user_id: 'a' }), p({ user_id: 'b' }), p({ user_id: 'c' })];
    const { destinatarios, foraDoEnvio } = selecionarDestinatarios(lista, new Set(['b']), 'nunca_acessaram');

    expect(destinatarios.map((d) => d.user_id)).toEqual(['a', 'c']);
    expect(foraDoEnvio).toEqual([{ nome: 'b@exemplo.com', motivo: 'Já acessou o app' }]);
  });

  it('no modo todos, quem já acessou volta para a lista', () => {
    const lista = [p({ user_id: 'a' }), p({ user_id: 'b' })];
    const { destinatarios } = selecionarDestinatarios(lista, new Set(['b']), 'todos');
    expect(destinatarios.map((d) => d.user_id)).toEqual(['a', 'b']);
  });

  it('inativo nunca recebe convite, nem no modo todos', () => {
    // Foi desligado do serviço: um convite o traria de volta para dentro.
    const lista = [p({ user_id: 'a', active: false, full_name: 'Dr. Desligado' })];

    for (const modo of ['nunca_acessaram', 'todos'] as const) {
      const r = selecionarDestinatarios(lista, new Set(), modo);
      expect(r.destinatarios).toHaveLength(0);
      expect(r.foraDoEnvio).toEqual([{ nome: 'Dr. Desligado', motivo: 'Inativo no serviço' }]);
    }
  });

  it('sem e-mail fica de fora, com o motivo dito', () => {
    const lista = [p({ user_id: 'a', email: null, name: 'Dra. Ana' }), p({ user_id: 'b', email: '   ' })];
    const { destinatarios, foraDoEnvio } = selecionarDestinatarios(lista, new Set(), 'todos');

    expect(destinatarios).toHaveLength(0);
    expect(foraDoEnvio.map((f) => f.motivo)).toEqual(['Sem e-mail cadastrado', 'Sem e-mail cadastrado']);
    expect(foraDoEnvio[0].nome).toBe('Dra. Ana');
  });

  it('e-mail repetido só entra uma vez — o segundo link mataria o primeiro', () => {
    const lista = [
      p({ user_id: 'a', email: 'MESMO@exemplo.com', full_name: 'Cadastro antigo' }),
      p({ user_id: 'b', email: 'mesmo@exemplo.com', full_name: 'Cadastro novo' }),
    ];
    const { destinatarios, foraDoEnvio } = selecionarDestinatarios(lista, new Set(), 'todos');

    expect(destinatarios).toHaveLength(1);
    expect(destinatarios[0].email).toBe('mesmo@exemplo.com');
    expect(foraDoEnvio).toEqual([{ nome: 'Cadastro novo', motivo: 'E-mail repetido nesta lista' }]);
  });

  it('normaliza o e-mail, porque o envio não pode depender de maiúscula', () => {
    const { destinatarios } = selecionarDestinatarios(
      [p({ user_id: 'a', email: '  Dr.Joao@Exemplo.COM ' })],
      new Set(),
      'todos',
    );
    expect(destinatarios[0].email).toBe('dr.joao@exemplo.com');
  });

  it('prefere o nome completo, e nunca fica sem nome', () => {
    const lista = [
      p({ user_id: 'a', full_name: 'Dr. Completo', name: 'apelido' }),
      p({ user_id: 'b', full_name: null, name: 'Só apelido' }),
      p({ user_id: 'c', full_name: null, name: null, email: 'x@y.com' }),
    ];
    const { destinatarios } = selecionarDestinatarios(lista, new Set(), 'todos');
    expect(destinatarios.map((d) => d.nome)).toEqual(['Dr. Completo', 'Só apelido', 'x@y.com']);
  });

  it('lista vazia não quebra', () => {
    expect(selecionarDestinatarios([], new Set(), 'todos')).toEqual({ destinatarios: [], foraDoEnvio: [] });
  });
});

describe('resumoDoEnvio', () => {
  it('conta acertos e falhas', () => {
    expect(resumoDoEnvio([
      { nome: 'a', email: 'a@x', enviado: true },
      { nome: 'b', email: 'b@x', enviado: true },
      { nome: 'c', email: 'c@x', enviado: false, erro: 'sem caixa' },
    ])).toBe('2 convites enviados, 1 falhou.');
  });

  it('tudo certo não menciona falha', () => {
    expect(resumoDoEnvio([{ nome: 'a', email: 'a@x', enviado: true }])).toBe('1 convite enviado.');
  });

  it('nada enviado não vira sucesso', () => {
    expect(resumoDoEnvio([{ nome: 'a', email: 'a@x', enviado: false }])).toBe('0 convites enviados, 1 falhou.');
    expect(resumoDoEnvio([])).toBe('Nenhum convite para enviar.');
  });
});

describe('tempoEstimado', () => {
  it('fala em segundos nas listas curtas e em minutos nas longas', () => {
    expect(tempoEstimado(10)).toContain('segundos');
    expect(tempoEstimado(93)).toContain('minuto');
  });
});
