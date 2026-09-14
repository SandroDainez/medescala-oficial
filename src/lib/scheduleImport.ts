// Importação de escala — lógica pura (sem React/Supabase), usada pelo calendário.
//
// Duas partes:
// 1) parseEscalasGrid: lê a "escala impressa" em grade semanal (exportação de outros
//    sistemas): linha com "SEG 07/09 | TER 08/09 | ...", e em cada coluna blocos
//    "07:00~19:00" seguidos dos nomes daquela faixa, em alturas diferentes por coluna.
// 2) matchImportedName: casa o nome da planilha com um profissional cadastrado.
//
// Regras aprendidas com escalas reais (valem para qualquer hospital/setor):
// - O rodapé "FU: Furo | FJ: Falta Justificada | ..." é legenda, não plantonista.
// - "<Sem Responsável>" é vaga explícita, não um nome.
// - Não existe faixa implícita: só se assume 07:00–19:00 quando há nome sem nenhum
//   horário acima dele na coluna (e isso gera aviso).
// - Casamento aproximado NUNCA pode trocar a pessoa: exige primeiro nome compatível,
//   todas as palavras do nome mais curto presentes no mais longo, e candidato único.
//   Sobrenome em comum não basta ("SEBASTIAN SALVATIERRA ANEZ" ≠ "JOSÉ MIGUEL SALVATIERRA ANEZ").
// - Tolera 1 letra de diferença por palavra longa ("MARUAN" = "Maruam", "SEBASTIAN" = "SABASTIAN").

import { format } from 'date-fns';

export type GridCell = string | number | Date | null | undefined;

export interface EscalasGridSlot {
  /** yyyy-MM-dd */
  date: string;
  start: string;
  end: string;
  /** Nomes da faixa, sem repetição, na ordem da planilha. */
  names: string[];
  /** Vagas explícitas ("<Sem Responsável>") ou faixa sem ninguém embaixo. */
  vacancies: number;
  /** Linha do cabeçalho do dia (para localizar o setor acima dela). */
  dayRow: number;
  column: number;
}

export interface EscalasGridResult {
  slots: EscalasGridSlot[];
  warnings: string[];
  period: { start: string; end: string } | null;
}

const DAY_REGEX = /\b(?:SEG|TER|QUA|QUI|SEX|SAB|SÁB|DOM)\s*(\d{1,2})\/(\d{1,2})\b/i;
const RANGE_REGEX = /(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/;
const PERIOD_REGEX = /(\d{2})\/(\d{2})\/(\d{4})\s*[~-]\s*(\d{2})\/(\d{2})\/(\d{4})/;
const DEFAULT_RANGE = { start: '07:00', end: '19:00' };

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatClock(hh: string, mm: string): string | null {
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Legenda de códigos no rodapé (ex.: "FU: Furo | FJ: Falta Justificada | ..."). */
export function isLegendCell(raw: string): boolean {
  const norm = normalizeText(raw);
  if (/falta (nao )?justificada/.test(norm)) return true;
  const codes = raw.match(/\b[A-Z]{2}\s*:\s*[A-Za-zÀ-ÿ]/g);
  return (codes?.length ?? 0) >= 2;
}

/** Marcador de vaga explícita no lugar de um nome. */
export function isVacancyMarker(raw: string): boolean {
  const norm = normalizeText(raw).replace(/[<>()[\]{}]/g, '').trim();
  return /^(sem responsavel|sem plantonista|vago|vaga|a definir|em aberto|-+)$/.test(norm);
}

function isIgnoredText(raw: string): boolean {
  const norm = normalizeText(raw);
  if (!norm) return true;
  if (norm.includes('escalas') || norm.includes('profissional de plantao') || norm.includes('gerado em')) return true;
  if (/^local\s*:/.test(norm)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(norm)) return true;
  if (/^(seg|ter|qua|qui|sex|sab|dom)\s*\d{1,2}\/\d{1,2}$/.test(norm)) return true;
  return false;
}

export function parseEscalasGrid(
  matrix: GridCell[][],
  options: { fallbackYear: number },
): EscalasGridResult {
  const slots: EscalasGridSlot[] = [];
  const warnings: string[] = [];
  if (!matrix.length) return { slots, warnings, period: null };

  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  scan: for (let r = 0; r < Math.min(20, matrix.length); r++) {
    for (const cell of matrix[r] || []) {
      const match = String(cell ?? '').match(PERIOD_REGEX);
      if (match) {
        periodStart = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        periodEnd = new Date(Number(match[6]), Number(match[5]) - 1, Number(match[4]));
        break scan;
      }
    }
  }

  // Resolve o ano do "SEG 07/09": com período declarado, aceita o ano do início ou o
  // seguinte (escala dezembro→janeiro) e descarta dias fora do período.
  const resolveDate = (day: number, month: number): Date | null => {
    const years = periodStart
      ? [periodStart.getFullYear(), periodStart.getFullYear() + 1]
      : [options.fallbackYear];
    for (const year of years) {
      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1 || date.getDate() !== day) continue;
      if (!periodStart || !periodEnd) return date;
      if (date >= periodStart && date <= periodEnd) return date;
    }
    return null;
  };

  const dayRows: number[] = [];
  for (let r = 0; r < matrix.length; r++) {
    if ((matrix[r] || []).some((cell) => DAY_REGEX.test(String(cell ?? '').trim()))) dayRows.push(r);
  }

  for (let idx = 0; idx < dayRows.length; idx++) {
    const r = dayRows[idx];
    const nextDayRow = dayRows[idx + 1] ?? matrix.length;
    const headerRow = matrix[r] || [];

    for (let c = 0; c < headerRow.length; c++) {
      const headerText = String(headerRow[c] ?? '').trim();
      const dayMatch = headerText.match(DAY_REGEX);
      if (!dayMatch) continue;

      const date = resolveDate(Number(dayMatch[1]), Number(dayMatch[2]));
      if (!date) continue;
      const dateKey = format(date, 'yyyy-MM-dd');

      const byRange = new Map<string, { start: string; end: string; names: string[]; seen: Set<string>; vacancies: number }>();
      let current: { start: string; end: string } | null = null;
      let assumedDefault = false;

      const ensure = (range: { start: string; end: string }) => {
        const key = `${range.start}|${range.end}`;
        let entry = byRange.get(key);
        if (!entry) {
          entry = { ...range, names: [], seen: new Set(), vacancies: 0 };
          byRange.set(key, entry);
        }
        return entry;
      };

      for (let rr = r + 1; rr < nextDayRow; rr++) {
        const raw = String(matrix[rr]?.[c] ?? '').trim();
        if (!raw) continue;
        if (isLegendCell(raw)) break; // rodapé: nada abaixo pertence ao dia

        const range = raw.match(RANGE_REGEX);
        if (range) {
          const start = formatClock(range[1], range[2]);
          const end = formatClock(range[3], range[4]);
          if (start && end) {
            current = { start, end };
            ensure(current);
          } else {
            warnings.push(`${headerText}: horário inválido "${raw}" ignorado.`);
          }
          continue;
        }

        const parts = raw.split(/\n|;|,|\|/g).map((p) => p.trim()).filter(Boolean);
        for (const part of parts) {
          if (isIgnoredText(part)) continue;
          if (!current) {
            current = DEFAULT_RANGE;
            assumedDefault = true;
          }
          const entry = ensure(current);
          if (isVacancyMarker(part)) {
            entry.vacancies += 1;
            continue;
          }
          const key = normalizeText(part);
          if (entry.seen.has(key)) {
            warnings.push(`${headerText} ${entry.start}–${entry.end}: "${part}" aparece repetido na mesma faixa (considerado uma vez).`);
            continue;
          }
          entry.seen.add(key);
          entry.names.push(part);
        }
      }

      if (assumedDefault) {
        warnings.push(`${headerText}: nomes sem horário acima deles — assumido ${DEFAULT_RANGE.start}–${DEFAULT_RANGE.end}.`);
      }

      for (const entry of byRange.values()) {
        const vacancies = entry.names.length === 0 && entry.vacancies === 0 ? 1 : entry.vacancies;
        slots.push({
          date: dateKey,
          start: entry.start,
          end: entry.end,
          names: entry.names,
          vacancies,
          dayRow: r,
          column: c,
        });
      }
    }
  }

  return {
    slots,
    warnings,
    period:
      periodStart && periodEnd
        ? { start: format(periodStart, 'yyyy-MM-dd'), end: format(periodEnd, 'yyyy-MM-dd') }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Casamento de nomes
// ---------------------------------------------------------------------------

export interface ImportPerson {
  user_id: string;
  name: string | null;
  full_name: string | null;
  profile_type: string | null;
  role: string | null;
  /** Diarista/visitador (memberships.is_diarista): não entra na importação, salvo se incluído. */
  is_diarista?: boolean | null;
}

export type ImportNameMatch =
  | { status: 'matched'; person: ImportPerson; approximate: boolean; eligible: boolean }
  | { status: 'ambiguous'; candidates: ImportPerson[] }
  | { status: 'not_found' };

/** Mesma regra do banco (trigger enforce_plantonista_assignment). */
export function isSchedulablePerson(person: ImportPerson): boolean {
  return person.profile_type === 'plantonista' && person.role !== 'admin' && person.role !== 'owner';
}

const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del']);

export function normalizePersonName(value: unknown): string {
  return normalizeText(value)
    .replace(/\bcrm[a-z]*\s*[:-]?\s*\d+[a-z0-9/-]*/g, ' ')
    .replace(/\bcoren\s*[:-]?\s*\d+[a-z0-9/-]*/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(drs?|dras?|medic[oa]s?|plantonistas?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function personTokens(value: unknown): string[] {
  return normalizePersonName(value).split(' ').filter((t) => t && !NAME_PARTICLES.has(t));
}

function levenshteinAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokensEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  // Inicial abreviada: "KEVIN T MAYSER" ~ "KEVIN TARDIO MAYSER"
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  // Erro de digitação de 1 letra só em palavras longas (evita "LUIS" ~ "LUIZ" virar outra pessoa por acaso)
  return Math.min(a.length, b.length) >= 5 && levenshteinAtMostOne(a, b);
}

function compareNameTokens(target: string[], candidate: string[]): { qualifies: boolean; full: boolean } {
  const no = { qualifies: false, full: false };
  if (target.length < 2 || candidate.length < 2) return no;
  if (!tokensEquivalent(target[0], candidate[0])) return no;

  const [short, long] = target.length <= candidate.length ? [target, candidate] : [candidate, target];
  if (short.filter((t) => t.length > 1).length < 2) return no;

  let j = 0;
  for (const token of short) {
    while (j < long.length && !tokensEquivalent(token, long[j])) j++;
    if (j === long.length) return no;
    j++;
  }
  return { qualifies: true, full: short.length === long.length };
}

export function matchImportedName(name: string, people: ImportPerson[]): ImportNameMatch {
  const target = normalizePersonName(name);
  const targetTokens = personTokens(name);
  if (!target || targetTokens.length === 0) return { status: 'not_found' };
  const targetJoined = targetTokens.join(' ');

  const variantsOf = (p: ImportPerson) => [p.full_name, p.name].filter((v): v is string => Boolean(v && v.trim()));

  const exact: ImportPerson[] = [];
  const approx: Array<{ person: ImportPerson; full: boolean }> = [];
  const seen = new Set<string>();

  for (const person of people) {
    if (seen.has(person.user_id)) continue;
    seen.add(person.user_id);
    const variants = variantsOf(person);
    if (variants.some((v) => normalizePersonName(v) === target || personTokens(v).join(' ') === targetJoined)) {
      exact.push(person);
      continue;
    }
    let qualifies = false;
    let full = false;
    for (const v of variants) {
      const cmp = compareNameTokens(targetTokens, personTokens(v));
      if (cmp.qualifies) {
        qualifies = true;
        full = full || cmp.full;
      }
    }
    if (qualifies) approx.push({ person, full });
  }

  const pickUnique = (list: Array<{ person: ImportPerson; full: boolean }>): ImportPerson | null => {
    if (list.length === 1) return list[0].person;
    const full = list.filter((c) => c.full);
    return full.length === 1 ? full[0].person : null;
  };

  if (exact.length > 0) {
    const eligibleExact = exact.filter(isSchedulablePerson);
    if (eligibleExact.length === 1) {
      return { status: 'matched', person: eligibleExact[0], approximate: false, eligible: true };
    }
    if (eligibleExact.length > 1) return { status: 'ambiguous', candidates: eligibleExact };

    // Nome exato só em conta que não pode receber plantão (ex.: conta admin da mesma
    // pessoa). Se houver UMA conta de plantonista compatível, usa ela.
    const eligibleApprox = pickUnique(approx.filter((c) => isSchedulablePerson(c.person)));
    if (eligibleApprox) return { status: 'matched', person: eligibleApprox, approximate: true, eligible: true };
    if (exact.length === 1) return { status: 'matched', person: exact[0], approximate: false, eligible: false };
    return { status: 'ambiguous', candidates: exact };
  }

  if (approx.length === 0) return { status: 'not_found' };
  const eligible = approx.filter((c) => isSchedulablePerson(c.person));
  const pool = eligible.length > 0 ? eligible : approx;
  const picked = pickUnique(pool);
  if (!picked) return { status: 'ambiguous', candidates: pool.map((c) => c.person) };
  return { status: 'matched', person: picked, approximate: true, eligible: isSchedulablePerson(picked) };
}

export function personDisplayName(person: ImportPerson): string {
  return person.full_name?.trim() || person.name?.trim() || 'Sem nome';
}

export interface ImportNameReport {
  /** Vínculos plantonista×plantão que serão gravados. */
  assignments: number;
  /** Linhas sem nome (vaga explícita ou faixa vazia). */
  vacancies: number;
  notFound: Array<{ name: string; count: number }>;
  ambiguous: Array<{ name: string; candidates: string[]; count: number }>;
  ineligible: Array<{ name: string; person: string; count: number }>;
  approximate: Array<{ name: string; person: string }>;
  /** Plantonistas que serão vinculados ao setor por aparecerem na escala dele. */
  sectorLinks: Array<{ person: string; sector: string }>;
  /**
   * Diaristas/visitadores encontrados na planilha. Por padrão NÃO entram (nem viram vaga);
   * `included` indica os que o administrador marcou para importar.
   */
  diaristas: Array<{ userId: string; person: string; count: number; included: boolean }>;
}

/** Resumo mostrado ANTES de importar: quem casa, quem não, quem será vinculado ao setor. */
export function buildImportNameReport(
  rows: Array<{ sector_id: string; sector_name: string; assignee_names?: string[] }>,
  people: ImportPerson[],
  sectorMemberships: Array<{ sector_id: string; user_id: string }>,
  includedDiaristas: ReadonlySet<string> = new Set(),
): ImportNameReport {
  const cache = new Map<string, ImportNameMatch>();
  const inSector = new Set(sectorMemberships.map((m) => `${m.sector_id}|${m.user_id}`));
  const notFound = new Map<string, number>();
  const ambiguous = new Map<string, { candidates: string[]; count: number }>();
  const ineligible = new Map<string, { person: string; count: number }>();
  const approximate = new Map<string, string>();
  const sectorLinks = new Map<string, { person: string; sector: string }>();
  const diaristas = new Map<string, { person: string; count: number }>();
  let assignments = 0;
  let vacancies = 0;

  for (const row of rows) {
    const names = Array.from(new Set((row.assignee_names ?? []).map((n) => n.trim()).filter(Boolean)));
    if (names.length === 0) {
      vacancies += 1;
      continue;
    }
    for (const name of names) {
      let match = cache.get(name);
      if (!match) {
        match = matchImportedName(name, people);
        cache.set(name, match);
      }
      if (match.status === 'not_found') {
        notFound.set(name, (notFound.get(name) ?? 0) + 1);
        continue;
      }
      if (match.status === 'ambiguous') {
        ambiguous.set(name, {
          candidates: match.candidates.map(personDisplayName),
          count: (ambiguous.get(name)?.count ?? 0) + 1,
        });
        continue;
      }
      if (!match.eligible) {
        ineligible.set(name, {
          person: personDisplayName(match.person),
          count: (ineligible.get(name)?.count ?? 0) + 1,
        });
        continue;
      }
      if (match.person.is_diarista) {
        const userId = match.person.user_id;
        diaristas.set(userId, {
          person: personDisplayName(match.person),
          count: (diaristas.get(userId)?.count ?? 0) + 1,
        });
        if (!includedDiaristas.has(userId)) continue;
      }
      assignments += 1;
      if (match.approximate) approximate.set(name, personDisplayName(match.person));
      const key = `${row.sector_id}|${match.person.user_id}`;
      if (!inSector.has(key) && !sectorLinks.has(key)) {
        sectorLinks.set(key, { person: personDisplayName(match.person), sector: row.sector_name });
      }
    }
  }

  return {
    assignments,
    vacancies,
    notFound: [...notFound].map(([name, count]) => ({ name, count })),
    ambiguous: [...ambiguous].map(([name, v]) => ({ name, ...v })),
    ineligible: [...ineligible].map(([name, v]) => ({ name, ...v })),
    approximate: [...approximate].map(([name, person]) => ({ name, person })),
    sectorLinks: [...sectorLinks.values()],
    diaristas: [...diaristas].map(([userId, v]) => ({ userId, ...v, included: includedDiaristas.has(userId) })),
  };
}
