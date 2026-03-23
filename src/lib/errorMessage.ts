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
