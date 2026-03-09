import { vi } from "vitest";

export interface MockQueryResult<T = unknown> {
  data?: T;
  error?: unknown;
}

export function createSupabaseQueryMock<T = unknown>(result: MockQueryResult<T> = {}) {
  const query: any = {};

  query.select = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.delete = vi.fn(() => query);
  query.upsert = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.lte = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  query.single = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  query.then = undefined;

  return query;
}
