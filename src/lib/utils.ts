import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses a date-only string (YYYY-MM-DD) as a local Date (no timezone shift).
 */
export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Escrito à mão porque o 'EEEEEE' do date-fns devolve "sab" sem acento,
// destoando dos outros seis dias.
const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** Abreviação do dia da semana, em português. */
export function diaDaSemanaCurto(data: Date): string {
  return DIAS_DA_SEMANA[data.getDay()];
}

