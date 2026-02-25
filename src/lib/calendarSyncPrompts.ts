const INITIAL_SYNC_ASKED_KEY = 'medescala-calendar-initial-asked';
const PROMPT_SESSION_KEY = 'medescala-calendar-prompt-shown';
const PROMPT_DISMISSED_KEY = 'medescala-calendar-prompt-dismissed';

export function resetCalendarInitialPrompt() {
  localStorage.removeItem(INITIAL_SYNC_ASKED_KEY);
}

export function resetCalendarPromptPreference() {
  localStorage.removeItem(PROMPT_DISMISSED_KEY);
  sessionStorage.removeItem(PROMPT_SESSION_KEY);
}

export const calendarSyncPromptKeys = {
  INITIAL_SYNC_ASKED_KEY,
  PROMPT_SESSION_KEY,
  PROMPT_DISMISSED_KEY,
};
