export const ADMIN_SECTORS_UPDATED_EVENT = 'admin-sectors-updated';

export function emitAdminSectorsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_SECTORS_UPDATED_EVENT));
}
