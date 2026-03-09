export interface NavigableNotification {
  type: string;
  shift_assignment_id?: string | null;
}

function buildPath(path: string, params: Record<string, string | null | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function getNotificationDestination(notification: NavigableNotification): string | null {
  const assignmentId = notification.shift_assignment_id ?? null;

  switch (notification.type) {
    case "swap_request":
      return buildPath("/app/swaps", {
        tab: "incoming",
        origin_assignment_id: assignmentId,
      });
    case "swap_request_update":
      return buildPath("/app/swaps", {
        tab: "history",
        origin_assignment_id: assignmentId,
      });
    case "offer":
      return buildPath("/app/available", {
        tab: "myoffers",
      });
    case "shift":
    case "assignment":
      return assignmentId ? buildPath("/app/swaps", { assignment: assignmentId }) : "/app/shifts";
    default:
      return null;
  }
}
