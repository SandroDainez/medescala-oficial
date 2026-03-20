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
  approveAdminOffer,
  acceptAdminShiftOffer,
  deleteAdminOffers,
  rejectAdminShiftOffer,
} from "@/services/adminOffers";

describe("adminOffers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an offer and rejects the remaining pending ones", async () => {
    rpcMock.mockResolvedValue({ data: [{ assignment_id: "asg-1" }], error: null });

    await acceptAdminShiftOffer({
      offerId: "offer-1",
      shiftId: "shift-1",
      reviewerId: "admin-1",
    });

    expect(rpcMock).toHaveBeenCalledWith("accept_shift_offer_with_snapshot", {
      _offer_id: "offer-1",
      _reviewer_id: "admin-1",
    });
  });

  it("rejects one offer by id", async () => {
    const query = createSupabaseQueryMock();
    query.eq.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await rejectAdminShiftOffer({
      offerId: "offer-2",
      reviewerId: "admin-2",
    });

    expect(query.eq).toHaveBeenCalledWith("id", "offer-2");
  });

  it("approves an offer through snapshot rpc", async () => {
    const existingAssignmentsQuery = createSupabaseQueryMock();
    const notifyQuery = createSupabaseQueryMock();

    existingAssignmentsQuery.in.mockImplementation(async () => ({ data: [], error: null }));
    notifyQuery.insert.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValue({
      data: [{ assignment_id: "asg-9", assigned_value: 1200, value_source: "shift_base" }],
      error: null,
    });

    fromMock
      .mockReturnValueOnce(existingAssignmentsQuery)
      .mockReturnValueOnce(notifyQuery);

    await approveAdminOffer({
      tenantId: "tenant-1",
      reviewerId: "admin-1",
      offer: {
        id: "offer-9",
        status: "pending",
        message: null,
        created_at: "2026-03-11T10:00:00Z",
        reviewed_at: null,
        user_id: "user-1",
        shift_id: "shift-9",
        user: { name: "Dr. A" },
        shift: {
          id: "shift-9",
          title: "Plantao UTI",
          hospital: "Hospital Central",
          shift_date: "2026-03-20",
          start_time: "07:00:00",
          end_time: "19:00:00",
          base_value: 1200,
          sector: { name: "UTI", color: "#111111" },
        },
      },
    });

    expect(rpcMock).toHaveBeenCalledWith("accept_shift_offer_with_snapshot", {
      _offer_id: "offer-9",
      _reviewer_id: "admin-1",
    });
  });

  it("blocks approval when the shift is already assigned to another user", async () => {
    const existingAssignmentsQuery = createSupabaseQueryMock();
    existingAssignmentsQuery.in.mockImplementation(async () => ({
      data: [{ id: "asg-1", user_id: "other-user", status: "assigned" }],
      error: null,
    }));

    fromMock.mockReturnValueOnce(existingAssignmentsQuery);

    await expect(
      approveAdminOffer({
        tenantId: "tenant-1",
        reviewerId: "admin-1",
        offer: {
          id: "offer-10",
          status: "pending",
          message: null,
          created_at: "2026-03-11T10:00:00Z",
          reviewed_at: null,
          user_id: "user-1",
          shift_id: "shift-10",
          user: { name: "Dr. B" },
          shift: {
            id: "shift-10",
            title: "Plantao PS",
            hospital: "Hospital Central",
            shift_date: "2026-03-20",
            start_time: "07:00:00",
            end_time: "19:00:00",
            base_value: 1200,
            sector: { name: "PS", color: "#111111" },
          },
        },
      })
    ).rejects.toThrow("Este plantão já foi preenchido por outro plantonista.");
  });

  it("deletes selected offers", async () => {
    const query = createSupabaseQueryMock();
    query.in.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await deleteAdminOffers(["offer-3", "offer-4"]);

    expect(query.in).toHaveBeenCalledWith("id", ["offer-3", "offer-4"]);
  });
});
