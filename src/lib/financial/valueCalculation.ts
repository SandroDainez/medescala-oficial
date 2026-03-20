/**
 * REGRAS DE VALOR
 * 
 * Este módulo agora separa dois conceitos:
 * - leitura financeira de assignment existente: usar apenas assigned_value
 * - projeção operacional de valor: pode usar individual/base/setor
 * 
 * O financeiro consolidado NÃO deve recalcular assignment histórica.
 */

// Constante padrão: plantão de 12 horas
export const STANDARD_SHIFT_HOURS = 12;

/**
 * Calcula a duração em horas entre dois horários (formato HH:MM)
 */
export function calculateDurationHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return STANDARD_SHIFT_HOURS;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  let hours = endH - startH;
  const minutes = endM - startM;
  if (hours < 0 || (hours === 0 && minutes < 0)) {
    hours += 24;
  }
  return hours + minutes / 60;
}

/**
 * Aplica pró-rata a um valor base de 12h
 * Ex: R$ 1200 (12h) → R$ 600 (6h) ou R$ 2400 (24h)
 */
export function calculateProRata(baseValue: number | null, durationHours: number): number | null {
  if (baseValue === null || baseValue === 0) return baseValue;
  if (durationHours === STANDARD_SHIFT_HOURS) return baseValue;
  return Number(((baseValue / STANDARD_SHIFT_HOURS) * durationHours).toFixed(2));
}

/**
 * Determina se é plantão noturno baseado no horário de início
 */
export function isNightShift(startTime: string): boolean {
  if (!startTime) return false;
  const [hour] = startTime.split(':').map(Number);
  return hour >= 19 || hour < 7;
}

/**
 * Tipo de fonte do valor
 */
export type ValueSource = 
  | 'assigned'        // Editado manualmente na Escala
  | 'individual'      // user_sector_values
  | 'base'            // shifts.base_value
  | 'sector_default'  // sectors.default_day/night_value
  | 'none';           // Sem valor definido

/**
 * Resultado do cálculo de valor final
 */
export interface ValueResult {
  finalValue: number | null;
  source: ValueSource;
  durationHours: number;
  /** O valor base (12h) antes do pró-rata, para referência */
  baseValueUsed: number | null;
}

/**
 * Leitura financeira de assignment existente.
 * Snapshot é a única fonte de verdade.
 */
export function calculateAssignedSnapshotValue(assignedValue: number | null): ValueResult {
  if (assignedValue !== null) {
    return {
      finalValue: assignedValue,
      source: 'assigned',
      durationHours: STANDARD_SHIFT_HOURS,
      baseValueUsed: null,
    };
  }

  return {
    finalValue: null,
    source: 'none',
    durationHours: STANDARD_SHIFT_HOURS,
    baseValueUsed: null,
  };
}

/**
 * Projeção operacional para plantão ainda sem snapshot financeiro.
 * 
 * Parâmetros:
 * @param assignedValue - Valor salvo em shift_assignments.assigned_value (já pró-rata)
 * @param individualValue - Valor de user_sector_values (base 12h, precisa pró-rata)
 * @param sectorDefaultValue - Valor padrão do setor (base 12h, precisa pró-rata)
 * @param durationHours - Duração do plantão em horas
 * 
 * Retorna: { finalValue, source, durationHours, baseValueUsed }
 */
export function calculateFinalValue(params: {
  assignedValue: number | null;
  individualValue: number | null;
  baseValue: number | null;
  sectorDefaultValue: number | null;
  durationHours: number;
}): ValueResult {
  const { assignedValue, individualValue, baseValue, sectorDefaultValue, durationHours } = params;

  // PRIORIDADE 1: assigned_value (editado na Escala)
  // USAR COMO ESTÁ - já foi calculado com pró-rata no momento do save
  if (assignedValue !== null) {
    return {
      finalValue: assignedValue,
      source: 'assigned',
      durationHours,
      baseValueUsed: null, // Não sabemos o base original
    };
  }

  // PRIORIDADE 2: Valor individual (user_sector_values)
  // Aplicar pró-rata pois é valor base de 12h
  if (individualValue !== null) {
    const proRataValue = calculateProRata(individualValue, durationHours);
    return {
      finalValue: proRataValue,
      source: 'individual',
      durationHours,
      baseValueUsed: individualValue,
    };
  }

  // PRIORIDADE 3: base_value do plantão (shifts.base_value)
  // USAR COMO ESTÁ - é um valor final por plantão (não é base 12h)
  if (baseValue !== null) {
    return {
      finalValue: baseValue,
      source: 'base',
      durationHours,
      baseValueUsed: null,
    };
  }

  // PRIORIDADE 4: Valor padrão do setor
  // Aplicar pró-rata pois é valor base de 12h
  if (sectorDefaultValue !== null && sectorDefaultValue > 0) {
    const proRataValue = calculateProRata(sectorDefaultValue, durationHours);
    return {
      finalValue: proRataValue,
      source: 'sector_default',
      durationHours,
      baseValueUsed: sectorDefaultValue,
    };
  }

  // Sem valor definido
  return {
    finalValue: null,
    source: 'none',
    durationHours,
    baseValueUsed: null,
  };
}

/**
 * Formata valor monetário para exibição
 */
export function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Retorna o label legível para a fonte do valor
 */
export function getSourceLabel(source: ValueSource): string {
  switch (source) {
    case 'assigned':
      return 'Editado';
    case 'individual':
      return 'Individual';
    case 'base':
      return 'Base do plantão';
    case 'sector_default':
      return 'Padrão';
    case 'none':
      return 'Sem valor';
  }
}
