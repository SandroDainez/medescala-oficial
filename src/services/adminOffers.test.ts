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

  it("deletes selected offers", async () => {
    const query = createSupabaseQueryMock();
    query.in.mockImplementation(async () => ({ error: null }));
    fromMock.mockReturnValue(query);

    await deleteAdminOffers(["offer-3", "offer-4"]);

    expect(query.in).toHaveBeenCalledWith("id", ["offer-3", "offer-4"]);
  });
});
