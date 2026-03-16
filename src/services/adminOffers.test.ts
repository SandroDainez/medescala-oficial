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
    const acceptQuery = createSupabaseQueryMock();
    const rejectQuery = createSupabaseQueryMock();
    acceptQuery.eq.mockImplementation(async () => ({ error: null }));
    rejectQuery.neq.mockImplementation(async () => ({ error: null }));

    fromMock
      .mockReturnValueOnce(acceptQuery)
      .mockReturnValueOnce(rejectQuery);

    await acceptAdminShiftOffer({
      offerId: "offer-1",
      shiftId: "shift-1",
      reviewerId: "admin-1",
    });

    expect(acceptQuery.eq).toHaveBeenCalledWith("id", "offer-1");
    expect(rejectQuery.eq).toHaveBeenCalledWith("shift_id", "shift-1");
    expect(rejectQuery.neq).toHaveBeenCalledWith("id", "offer-1");
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

  it("approves an offer by assigning with updated_by instead of created_by", async () => {
    const existingAssignmentsQuery = createSupabaseQueryMock();
    const offerUpdateQuery = createSupabaseQueryMock();
    const assignmentInsertQuery = createSupabaseQueryMock();
    const rejectOthersQuery = createSupabaseQueryMock();
    const notifyQuery = createSupabaseQueryMock();

    existingAssignmentsQuery.in.mockImplementation(async () => ({ data: [], error: null }));
    offerUpdateQuery.eq.mockImplementation(async () => ({ error: null }));
    assignmentInsertQuery.insert.mockResolvedValue({ error: null });
    rejectOthersQuery.neq.mockImplementation(async () => ({ error: null }));
    notifyQuery.insert.mockResolvedValue({ error: null });

    fromMock
      .mockReturnValueOnce(existingAssignmentsQuery)
      .mockReturnValueOnce(offerUpdateQuery)
      .mockReturnValueOnce(assignmentInsertQuery)
      .mockReturnValueOnce(rejectOthersQuery)
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

    expect(assignmentInsertQuery.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      shift_id: "shift-9",
      user_id: "user-1",
      assigned_value: 1200,
      status: "assigned",
      updated_by: "admin-1",
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
