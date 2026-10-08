/**
 * Quais plantões entram no Relatório de Check-ins.
 *
 * O relatório listava TODO plantão do mês, inclusive de setores onde o check-in
 * nem está habilitado. Esses nunca vão ter registro, então apareciam todos como
 * "Sem registro" e inflavam o total: em outubro/2026 o relatório mostrava 171
 * plantões e 171 sem check-in, quando só 88 eram de setor com check-in ligado —
 * os outros 83 eram do APAS Centro Cirurgico, que não usa check-in. O número
 * assusta sem motivo e esconde as faltas de verdade.
 */

export type PlantaoDoRelatorio = {
  /** O setor exige check-in hoje. */
  setorExigeCheckin: boolean;
  checkin_at?: string | null;
  checkout_at?: string | null;
};

/**
 * Entra no relatório se o setor usa check-in HOJE, ou se aquele plantão já tem
 * registro de entrada ou saída.
 *
 * A segunda condição existe para não apagar história: se um setor usou check-in
 * por um tempo e depois foi desligado, os registros que ele produziu continuam
 * valendo como comprovação de presença e precisam seguir visíveis.
 */
export function entraNoRelatorio(p: PlantaoDoRelatorio): boolean {
  if (p.setorExigeCheckin) return true;
  return Boolean(p.checkin_at) || Boolean(p.checkout_at);
}

export function filtrarPlantoesDoRelatorio<T extends PlantaoDoRelatorio>(lista: T[]): T[] {
  return (lista ?? []).filter(entraNoRelatorio);
}
