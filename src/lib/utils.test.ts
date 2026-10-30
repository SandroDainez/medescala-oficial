import { describe, it, expect } from 'vitest';
import { diaDaSemanaCurto, parseDateOnly } from './utils';

describe('diaDaSemanaCurto', () => {
  it('cobre a semana inteira, com acento no sábado', () => {
    // 01/11/2026 é domingo.
    const dias = Array.from({ length: 7 }, (_, i) => diaDaSemanaCurto(parseDateOnly(`2026-11-0${i + 1}`)));
    expect(dias).toEqual(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);
  });

  it('não desloca o dia por fuso — a data vem como YYYY-MM-DD', () => {
    expect(diaDaSemanaCurto(parseDateOnly('2026-11-02'))).toBe('seg');
  });
});
