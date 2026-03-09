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
  confirmAdminShiftExists,
  fetchAdminShiftsInRange,
  insertAdminShiftAndGetId,
  updateAdminShiftById,
  updateAdminShiftsByIds,
} from "@/services/adminShifts";

describe("adminShifts service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms if a shift exists", async () => {
    const query = createSupabaseQueryMock({ data: { id: "shift-1" } });
    fromMock.mockReturnValue(query);

    await expect(confirmAdminShiftExists("shift-1")).resolves.toBe(true);
    expect(query.eq).toHaveBeenCalledWith("id", "shift-1");
  });

  it("inserts a shift and returns the inserted id", async () => {
    const query = createSupabaseQueryMock({ data: { id: "shift-2" } });
    fromMock.mockReturnValue(query);

    await expect(
      insertAdminShiftAndGetId({
        tenant_id: "tenant-1",
        title: "Plantao",
        hospital: "Hospital A",
        location: null,
        shift_date: "2026-03-09",
        start_time: "07:00",
        end_time: "19:00",
        base_value: 1000,
        notes: null,
        sector_id: "sector-1",
      }),
    ).resolves.toBe("shift-2");
  });

  it("updates one shift by id", async () => {
    const query = createSupabaseQueryMock();
    query.eq.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await updateAdminShiftById("shift-3", { title: "Novo" });

    expect(query.update).toHaveBeenCalledWith({ title: "Novo" });
    expect(query.eq).toHaveBeenCalledWith("id", "shift-3");
  });

  it("updates many shifts by ids", async () => {
    const query = createSupabaseQueryMock();
    query.in.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await updateAdminShiftsByIds(["a", "b"], { updated_by: "admin-1" });

    expect(query.in).toHaveBeenCalledWith("id", ["a", "b"]);
  });

  it("fetches shifts in a period", async () => {
    const query = createSupabaseQueryMock();
    query.order
      .mockReturnValueOnce(query)
      .mockImplementationOnce(async () => ({ data: [{ id: "shift-1" }], error: null }));
    fromMock.mockReturnValue(query);

    const result = await fetchAdminShiftsInRange({
      tenantId: "tenant-1",
      start: "2026-03-01",
      end: "2026-03-31",
    });

    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(query.gte).toHaveBeenCalledWith("shift_date", "2026-03-01");
    expect(query.lte).toHaveBeenCalledWith("shift_date", "2026-03-31");
    expect(result).toEqual([{ id: "shift-1" }]);
  });
});
