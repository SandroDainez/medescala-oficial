import { describe, it, expect } from 'vitest';
import {
  ALERTAS_PADRAO,
  mensagemDaSincronizacao,
  montarEventoDoPlantao,
  permissaoConcedida,
} from './calendarioDoCelular';

describe('permissaoConcedida', () => {
  it('só aceita permissão concedida de fato', () => {
    expect(permissaoConcedida('granted')).toBe(true);
    expect(permissaoConcedida('denied')).toBe(false);
    expect(permissaoConcedida('prompt')).toBe(false);
    expect(permissaoConcedida('prompt-with-rationale')).toBe(false);
  });

  it('resposta negada do plugin não pode virar permissão — era o defeito', () => {
    // A checagem antiga era `resultado && typeof resultado === 'object'`, que
    // dava verdadeiro até para a resposta de recusa. O app seguia adiante e
    // anunciava "Plantões sincronizados" sem ter gravado nada.
    const respostaDeRecusa = { readCalendar: 'denied', writeCalendar: 'denied' };
    expect(typeof respostaDeRecusa === 'object').toBe(true); // o teste antigo passava
    expect(permissaoConcedida(respostaDeRecusa)).toBe(false); // o novo não
  });

  it('não quebra com ausência de resposta', () => {
    expect(permissaoConcedida(undefined)).toBe(false);
    expect(permissaoConcedida(null)).toBe(false);
  });
});

describe('montarEventoDoPlantao', () => {
  const diurno = {
    id: 's1',
    title: 'Plantão UTI',
    hospital: 'Beneficência Portuguesa',
    location: 'Bloco B',
    shift_date: '2026-11-03',
    start_time: '07:00:00',
    end_time: '19:00:00',
    sector_name: 'UTI Adulto',
  };

  it('usa o campo description, que é o que o plugin lê', () => {
    // Enviar `notes` não dava erro: o campo era ignorado e o evento nascia vazio.
    const evento = montarEventoDoPlantao(diurno);
    expect(evento.description).toContain('Setor: UTI Adulto');
    expect(evento.description).toContain('Hospital: Beneficência Portuguesa');
    expect(evento).not.toHaveProperty('notes');
  });

  it('leva alertas — a tela promete lembretes automáticos', () => {
    expect(montarEventoDoPlantao(diurno).alerts).toEqual(ALERTAS_PADRAO);
  });

  it('plantão noturno termina no dia seguinte', () => {
    const noturno = { ...diurno, start_time: '19:00:00', end_time: '07:00:00' };
    const evento = montarEventoDoPlantao(noturno);
    const horas = (evento.endDate - evento.startDate) / 3_600_000;
    expect(horas).toBe(12);
    expect(new Date(evento.endDate).getDate()).toBe(4);
  });

  it('plantão diurno dura o que diz, no mesmo dia', () => {
    const evento = montarEventoDoPlantao(diurno);
    expect((evento.endDate - evento.startDate) / 3_600_000).toBe(12);
    expect(new Date(evento.startDate).getDate()).toBe(3);
  });

  it('sem local, não inventa um traço solto', () => {
    const evento = montarEventoDoPlantao({ ...diurno, location: null });
    expect(evento.location).toBe('Beneficência Portuguesa');
  });
});

describe('mensagemDaSincronizacao', () => {
  const zerado = { criados: 0, atualizados: 0, removidos: 0, falharam: 0 };

  it('nada gravado nunca pode ser anunciado como sucesso', () => {
    const r = mensagemDaSincronizacao({ ...zerado, falharam: 3 }, 3);
    expect(r.ok).toBe(false);
    expect(r.texto).toContain('permissão');
  });

  it('conta o que foi realmente gravado', () => {
    expect(mensagemDaSincronizacao({ ...zerado, criados: 5 }, 5).texto).toContain('5 plantões adicionados');
    expect(mensagemDaSincronizacao({ ...zerado, criados: 1 }, 1).texto).toContain('1 plantão adicionado');
  });

  it('sucesso parcial é dito como parcial', () => {
    const r = mensagemDaSincronizacao({ ...zerado, criados: 4, falharam: 2 }, 6);
    expect(r.ok).toBe(false);
    expect(r.texto).toContain('4 plantões adicionados');
    expect(r.texto).toContain('2 falharam');
  });

  it('quem não tem plantão recebe explicação, não erro', () => {
    const r = mensagemDaSincronizacao(zerado, 0);
    expect(r.ok).toBe(true);
    expect(r.texto).toContain('ainda não tem plantões');
  });
});
