import { getNotificationDestination } from "@/lib/notificationNavigation";

describe("notification navigation", () => {
  it("routes swap request notifications to incoming swaps", () => {
    expect(
      getNotificationDestination({
        type: "swap_request",
        shift_assignment_id: "asg-1",
      }),
    ).toBe("/app/swaps?tab=incoming&origin_assignment_id=asg-1");
  });

  it("routes swap updates to swap history", () => {
    expect(
      getNotificationDestination({
        type: "swap_request_update",
        shift_assignment_id: "asg-2",
      }),
    ).toBe("/app/swaps?tab=history&origin_assignment_id=asg-2");
  });

  it("routes offers to my offers tab", () => {
    expect(
      getNotificationDestination({
        type: "offer",
      }),
    ).toBe("/app/available?tab=myoffers");
  });

  it("routes assignment notifications to the assignment context when available", () => {
    expect(
      getNotificationDestination({
        type: "assignment",
        shift_assignment_id: "asg-3",
      }),
    ).toBe("/app/swaps?assignment=asg-3");
  });

  it("falls back to shifts when assignment id is missing", () => {
    expect(
      getNotificationDestination({
        type: "shift",
      }),
    ).toBe("/app/shifts");
  });

  it("returns null for unsupported notification types", () => {
    expect(
      getNotificationDestination({
        type: "unknown_type",
      }),
    ).toBeNull();
  });
});
