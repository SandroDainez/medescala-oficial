import { describe, it, expect } from 'vitest';
import { entraNoRelatorio, filtrarPlantoesDoRelatorio } from './relatorioCheckin';

describe('quais plantões entram no Relatório de Check-ins', () => {
  it('setor com check-in ligado entra, mesmo sem registro ainda', () => {
    expect(entraNoRelatorio({ setorExigeCheckin: true })).toBe(true);
    expect(entraNoRelatorio({ setorExigeCheckin: true, checkin_at: null })).toBe(true);
  });

  it('setor SEM check-in e sem registro fica de fora', () => {
    // Era o defeito: 83 plantões do APAS Centro Cirurgico entravam como
    // "Sem registro" num setor que nem usa check-in.
    expect(entraNoRelatorio({ setorExigeCheckin: false })).toBe(false);
    expect(entraNoRelatorio({ setorExigeCheckin: false, checkin_at: null, checkout_at: null })).toBe(
      false,
    );
  });

  it('setor desligado DEPOIS não apaga o registro que já existia', () => {
    expect(
      entraNoRelatorio({ setorExigeCheckin: false, checkin_at: '2026-10-01T10:00:00Z' }),
    ).toBe(true);
    expect(
      entraNoRelatorio({ setorExigeCheckin: false, checkout_at: '2026-10-01T19:00:00Z' }),
    ).toBe(true);
  });

  it('reproduz outubro/2026: de 171 plantões sobram os 88 que fazem sentido', () => {
    const staffs = Array.from({ length: 88 }, () => ({ setorExigeCheckin: true }));
    const apas = Array.from({ length: 83 }, () => ({ setorExigeCheckin: false }));
    const todos = [...staffs, ...apas];
    expect(todos.length).toBe(171);
    expect(filtrarPlantoesDoRelatorio(todos).length).toBe(88);
  });

  it('um check-in antigo no setor desligado continua aparecendo', () => {
    const lista = [
      { setorExigeCheckin: false, checkin_at: '2026-09-10T10:00:00Z' },
      { setorExigeCheckin: false },
      { setorExigeCheckin: true },
    ];
    expect(filtrarPlantoesDoRelatorio(lista).length).toBe(2);
  });

  it('lista vazia não quebra', () => {
    expect(filtrarPlantoesDoRelatorio([])).toEqual([]);
    // @ts-expect-error — simula resposta ausente da API
    expect(filtrarPlantoesDoRelatorio(undefined)).toEqual([]);
  });
});
