import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/test/supabaseMock";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

import {
  createAdminConflictResolution,
  deleteAdminConflictHistoryByIds,
  deleteAllAdminConflictHistory,
  fetchAdminConflictHistory,
  resolveAdminProfileId,
} from "@/services/adminConflicts";

describe("adminConflicts service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves an existing profile id", async () => {
    const query = createSupabaseQueryMock({ data: { id: "user-1" } });
    fromMock.mockReturnValue(query);

    await expect(resolveAdminProfileId("user-1")).resolves.toBe("user-1");
  });

  it("creates a conflict resolution row", async () => {
    const query = createSupabaseQueryMock();
    query.insert.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await createAdminConflictResolution({ tenant_id: "tenant-1", resolution_type: "acknowledged" });

    expect(fromMock).toHaveBeenCalledWith("conflict_resolutions");
  });

  it("fetches conflict history ordered by resolved_at", async () => {
    const query = createSupabaseQueryMock();
    query.limit.mockImplementation(async () => ({ data: [{ id: "history-1" }], error: null }));
    fromMock.mockReturnValue(query);

    const result = await fetchAdminConflictHistory("tenant-1");

    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result).toEqual([{ id: "history-1" }]);
  });

  it("deletes selected conflict history ids", async () => {
    const query = createSupabaseQueryMock();
    query.in.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await deleteAdminConflictHistoryByIds({
      tenantId: "tenant-1",
      ids: ["a", "b"],
    });

    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(query.in).toHaveBeenCalledWith("id", ["a", "b"]);
  });

  it("deletes all conflict history for a tenant", async () => {
    const query = createSupabaseQueryMock();
    query.eq.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await deleteAllAdminConflictHistory("tenant-1");

    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
