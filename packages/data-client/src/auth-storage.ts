import { createUuid } from "@xiaobai-amax/utils";

const AUTH_TOKEN_KEY = "xiaobai-amax.auth-token";
const GUEST_ID_KEY = "xiaobai-amax.guest-id";
export const AUTH_CHANGE_EVENT = "xiaobai-amax:auth-change";

export function getGuestId(): string {
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = `guest_${createUuid().replace(/-/g, "")}`;
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    "X-Guest-ID": getGuestId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
