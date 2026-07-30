export const OPEN_AUTH_DIALOG_EVENT = "xiaobai-amax:open-auth-dialog";
const AUTH_PROMPT_DISMISSED_AT_KEY = "xiaobai-amax.auth-prompt-dismissed-at";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function openAuthDialog(): void {
  window.dispatchEvent(new Event(OPEN_AUTH_DIALOG_EVENT));
}

export function shouldShowAuthPrompt(): boolean {
  const dismissedAt = Number(localStorage.getItem(AUTH_PROMPT_DISMISSED_AT_KEY) ?? 0);
  return !dismissedAt || Date.now() - dismissedAt >= THREE_DAYS_MS;
}

export function dismissAuthPrompt(): void {
  localStorage.setItem(AUTH_PROMPT_DISMISSED_AT_KEY, String(Date.now()));
}
