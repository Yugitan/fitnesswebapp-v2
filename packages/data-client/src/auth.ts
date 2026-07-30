import {
  clearAuthToken,
  getAuthHeaders,
  getAuthToken,
  getGuestId,
  setAuthToken,
} from "./auth-storage";

const API_BASE = "/api";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export type AuthCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = AuthCredentials & {
  displayName: string;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: string } | undefined;
    throw new Error(payload?.error ?? `请求失败 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function registerUser(credentials: RegisterCredentials): Promise<AuthUser> {
  const result = await authRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...credentials, guestId: getGuestId() }),
  });
  setAuthToken(result.token);
  return result.user;
}

export async function loginUser(credentials: AuthCredentials): Promise<AuthUser> {
  const result = await authRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ ...credentials, guestId: getGuestId() }),
  });
  setAuthToken(result.token);
  return result.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!getAuthToken()) return null;
  try {
    const result = await authRequest<{ user: AuthUser | null }>("/auth/me");
    return result.user;
  } catch (error) {
    clearAuthToken();
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await authRequest("/auth/logout", { method: "POST" });
  } finally {
    clearAuthToken();
  }
}
