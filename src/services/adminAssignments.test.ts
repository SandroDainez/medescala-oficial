import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/test/supabaseMock";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

import {
  deleteAdminAssignment,
  fetchAdminAssignmentRange,
  fetchAdminAssignmentsByShiftIds,
  transferAdminAssignment,
  updateAdminAssignmentValue,
  upsertAdminAssignment,
} from "@/services/adminAssignments";

describe("adminAssignments service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts an assignment and returns selected row", async () => {
    const query = createSupabaseQueryMock({ data: { id: "asg-1" } });
    fromMock.mockReturnValue(query);

    const result = await upsertAdminAssignment({
      tenantId: "tenant-1",
      shiftId: "shift-1",
      userId: "user-1",
      assignedValue: 500,
      updatedBy: "admin-1",
    });

    expect(fromMock).toHaveBeenCalledWith("shift_assignments");
    expect(query.upsert).toHaveBeenCalled();
    expect(result).toEqual({ id: "asg-1" });
  });

  it("updates assignment value by id", async () => {
    const query = createSupabaseQueryMock({ data: { id: "asg-2" } });
    fromMock.mockReturnValue(query);

    const result = await updateAdminAssignmentValue({
      assignmentId: "asg-2",
      assignedValue: null,
      updatedBy: "admin-1",
    });

    expect(query.update).toHaveBeenCalledWith({
      assigned_value: null,
      updated_by: "admin-1",
    });
    expect(query.eq).toHaveBeenCalledWith("id", "asg-2");
    expect(result).toEqual({ id: "asg-2" });
  });

  it("fetches assignments by shift ids", async () => {
    const query = createSupabaseQueryMock({
      data: [{ id: "asg-1", shift_id: "shift-1" }],
    });
    query.in.mockImplementation(async () => ({ data: [{ id: "asg-1", shift_id: "shift-1" }], error: null }));
    fromMock.mockReturnValue(query);

    const result = await fetchAdminAssignmentsByShiftIds(["shift-1"]);

    expect(query.select).toHaveBeenCalled();
    expect(query.in).toHaveBeenCalledWith("shift_id", ["shift-1"]);
    expect(result).toEqual([{ id: "asg-1", shift_id: "shift-1" }]);
  });

  it("fetches assignment range through rpc", async () => {
    rpcMock.mockResolvedValue({
      data: [{ shift_id: "shift-1" }],
      error: null,
    });

    const result = await fetchAdminAssignmentRange({
      tenantId: "tenant-1",
      start: "2026-03-01",
      end: "2026-03-31",
    });

    expect(rpcMock).toHaveBeenCalledWith("get_shift_assignments_range", {
      _tenant_id: "tenant-1",
      _start: "2026-03-01",
      _end: "2026-03-31",
    });
    expect(result).toEqual([{ shift_id: "shift-1" }]);
  });

  it("deletes an assignment and returns selected rows", async () => {
    const query = createSupabaseQueryMock();
    query.select.mockImplementation(async () => ({ data: [{ id: "asg-3" }], error: null }));
    fromMock.mockReturnValue(query);

    const result = await deleteAdminAssignment("asg-3");

    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("id", "asg-3");
    expect(result).toEqual([{ id: "asg-3" }]);
  });

  it("transfers assignment by creating target and deleting source", async () => {
    const upsertQuery = createSupabaseQueryMock({ data: { id: "new-asg" } });
    const deleteQuery = createSupabaseQueryMock();
    deleteQuery.select.mockImplementation(async () => ({ data: [{ id: "old-asg" }], error: null }));

    fromMock
      .mockReturnValueOnce(upsertQuery)
      .mockReturnValueOnce(deleteQuery);

    const result = await transferAdminAssignment({
      tenantId: "tenant-1",
      sourceAssignmentId: "old-asg",
      targetShiftId: "shift-2",
      userId: "user-1",
      assignedValue: 700,
      updatedBy: "admin-1",
    });

    expect(result).toEqual({ insertedId: "new-asg" });
  });
});
