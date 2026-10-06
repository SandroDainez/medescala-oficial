// Busca por texto nas telas — padrão do app: ignora acentos, maiúsculas e espaços extras.
//
// Por que existe: os nomes são gravados como vieram do cadastro ("MÁRIO JUSTINIANO ARAUZ",
// "FLÁVIO DE ANGELIS", "VIVIANE INÊS NAHAS"). Comparando só com toLowerCase(), digitar
// "mario" não encontrava "MÁRIO" — o usuário conclui que o cadastro não foi salvo.

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O termo casa se TODAS as suas palavras aparecerem em algum dos campos.
 * Assim "arauz mario" encontra "MÁRIO JUSTINIANO ARAUZ" (ordem não importa).
 */
export function matchesSearch(fields: Array<unknown>, term: string): boolean {
  const words = normalizeSearchText(term).split(' ').filter(Boolean);
  if (words.length === 0) return true;

  const normalizedFields = fields.map(normalizeSearchText).filter(Boolean);
  if (normalizedFields.length === 0) return false;

  return words.every((word) => normalizedFields.some((field) => field.includes(word)));
}
