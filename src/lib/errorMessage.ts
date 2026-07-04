type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  error?: unknown;
  status?: unknown;
  statusText?: unknown;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return normalizeText(error) || fallback;
  }

  if (error instanceof Error) {
    return normalizeText(error.message) || fallback;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as ErrorLike;
    const nested = candidate.error;

    const parts = [
      candidate.message,
      candidate.details,
      candidate.hint,
      candidate.code,
      candidate.statusText,
      typeof candidate.status === 'number' ? `HTTP ${candidate.status}` : candidate.status,
    ]
      .map(normalizeText)
      .filter((value): value is string => Boolean(value));

    if (parts.length > 0) {
      return Array.from(new Set(parts)).join(' | ');
    }

    if (nested !== undefined && nested !== error) {
      return extractErrorMessage(nested, fallback);
    }
  }

  return fallback;
}

/**
 * Traduz mensagens de erro de autenticação/senha do Supabase (GoTrue), que vêm
 * sempre em inglês, para português. Cobre senha fraca, senha vazada, tamanho
 * mínimo, senha repetida e formatos inválidos. Retorna null se não reconhecer
 * o erro (para que o chamador use seu próprio fallback).
 */
export function translatePasswordError(error: unknown): string | null {
  const raw = extractErrorMessage(error, '').toLowerCase();
  if (!raw) return null;

  // Proteção de senha vazada / conhecida (leaked password protection)
  if (
    raw.includes('known to be weak') ||
    raw.includes('data breach') ||
    raw.includes('found in a') ||
    raw.includes('pwned')
  ) {
    return 'Esta senha é muito comum ou já apareceu em vazamentos de dados. Escolha uma senha diferente e mais difícil de adivinhar.';
  }

  // Senha fraca (weak_password)
  if (raw.includes('weak password') || raw.includes('weak_password') || raw.includes('too weak')) {
    return 'A senha é muito fraca. Use pelo menos 6 caracteres, combinando letras, números e símbolos.';
  }

  // Tamanho mínimo
  if (raw.includes('at least') && raw.includes('character')) {
    return 'A senha é muito curta. Use pelo menos 6 caracteres.';
  }

  // Senha igual à atual
  if (raw.includes('should be different') || raw.includes('same password') || raw.includes('same as the old')) {
    return 'A nova senha deve ser diferente da senha atual.';
  }

  // Senha inválida em geral
  if (raw.includes('invalid password') || raw.includes('requires a valid password')) {
    return 'Senha inválida. Use pelo menos 6 caracteres.';
  }

  return null;
}

export function buildErrorToastDescription(params: {
  action?: string;
  error?: unknown;
  fallback: string;
}) {
  const detail = extractErrorMessage(params.error, params.fallback);
  const actionLabel = normalizeText(params.action);

  if (!actionLabel) return `Detalhe: ${detail}`;

  return `Falha em ${actionLabel}: ${detail}`;
}
