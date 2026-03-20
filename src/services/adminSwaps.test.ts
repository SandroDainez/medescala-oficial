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

  it("assigns accepted offers through snapshot rpc", async () => {
    const existingAssignmentsQuery = createSupabaseQueryMock();
    const shiftUpdateQuery = createSupabaseQueryMock();

    existingAssignmentsQuery.in.mockImplementation(async () => ({ data: [], error: null }));
    shiftUpdateQuery.eq.mockImplementation(async () => ({ error: null }));
    rpcMock.mockResolvedValue({
      data: [{ assignment_id: "asg-1", assigned_value: 950, value_source: "shift_base" }],
      error: null,
    });

    fromMock
      .mockReturnValueOnce(existingAssignmentsQuery)
      .mockReturnValueOnce(shiftUpdateQuery);

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

    expect(rpcMock).toHaveBeenCalledWith("accept_shift_offer_with_snapshot", {
      _offer_id: "offer-1",
      _reviewer_id: "admin-1",
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
