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

import { decideAdminOffer } from "@/services/adminSwaps";

describe("adminSwaps service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns accepted offers using updated_by on shift assignments", async () => {
    const existingAssignmentsQuery = createSupabaseQueryMock();
    const offerUpdateQuery = createSupabaseQueryMock();
    const shiftSelectQuery = createSupabaseQueryMock({ data: { base_value: 950 } });
    const assignmentInsertQuery = createSupabaseQueryMock();
    const shiftUpdateQuery = createSupabaseQueryMock();
    const rejectOthersQuery = createSupabaseQueryMock();

    existingAssignmentsQuery.in.mockImplementation(async () => ({ data: [], error: null }));
    offerUpdateQuery.eq.mockImplementation(async () => ({ error: null }));
    assignmentInsertQuery.insert.mockResolvedValue({ error: null });
    shiftUpdateQuery.eq.mockImplementation(async () => ({ error: null }));
    rejectOthersQuery.neq.mockImplementation(async () => ({ error: null }));

    fromMock
      .mockReturnValueOnce(existingAssignmentsQuery)
      .mockReturnValueOnce(offerUpdateQuery)
      .mockReturnValueOnce(shiftSelectQuery)
      .mockReturnValueOnce(assignmentInsertQuery)
      .mockReturnValueOnce(shiftUpdateQuery)
      .mockReturnValueOnce(rejectOthersQuery);

    await decideAdminOffer({
      tenantId: "tenant-1",
      reviewerId: "admin-1",
      action: "accepted",
      offer: {
        id: "offer-1",
        shift_id: "shift-1",
        user_id: "user-1",
        message: null,
        status: "pending",
        created_at: "2026-03-11T10:00:00Z",
        profile: { name: "Dr. B" },
        shift: {
          title: "Plantao Clinica",
          hospital: "Hospital Central",
          shift_date: "2026-03-21",
          start_time: "07:00:00",
          end_time: "19:00:00",
          sector: { name: "Clinica", color: "#222222" },
        },
      },
    });

    expect(assignmentInsertQuery.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      shift_id: "shift-1",
      user_id: "user-1",
      assigned_value: 950,
      status: "assigned",
      updated_by: "admin-1",
    });
  });

  it("blocks accepted admin offers when the shift is already assigned to another user", async () => {
    const existingAssignmentsQuery = createSupabaseQueryMock();
    existingAssignmentsQuery.in.mockImplementation(async () => ({
      data: [{ id: "asg-1", user_id: "other-user", status: "assigned" }],
      error: null,
    }));

    fromMock.mockReturnValueOnce(existingAssignmentsQuery);

    await expect(
      decideAdminOffer({
        tenantId: "tenant-1",
        reviewerId: "admin-1",
        action: "accepted",
        offer: {
          id: "offer-1",
          shift_id: "shift-1",
          user_id: "user-1",
          message: null,
          status: "pending",
          created_at: "2026-03-11T10:00:00Z",
          profile: { name: "Dr. B" },
          shift: {
            title: "Plantao Clinica",
            hospital: "Hospital Central",
            shift_date: "2026-03-21",
            start_time: "07:00:00",
            end_time: "19:00:00",
            sector: { name: "Clinica", color: "#222222" },
          },
        },
      })
    ).rejects.toThrow("Este plantão já foi preenchido por outro plantonista.");
  });
});
