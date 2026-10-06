/**
 * Plural em português, para o texto que o médico lê.
 *
 * Existe porque o app tinha dois jeitos errados de pluralizar:
 * `plantão{n !== 1 ? 'ões' : ''}` virava "plantãoões" (o plural troca o "ão",
 * não o acrescenta), e `plantão(ões)` é legível mas feio — e aparece nas
 * capturas de tela das lojas.
 */
export function plural(n: number, singular: string, plural: string): string {
  return Math.abs(n) === 1 ? singular : plural;
}

/** "1 plantão" / "3 plantões" — o número junto, que é o uso mais comum. */
export function contar(n: number, singular: string, formaPlural: string): string {
  return `${n} ${plural(n, singular, formaPlural)}`;
}

export const plantoes = (n: number) => contar(n, 'plantão', 'plantões');
