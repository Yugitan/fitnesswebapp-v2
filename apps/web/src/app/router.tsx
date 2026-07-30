import { useEffect, useMemo, useState } from "react";

const configuredBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
export const APP_BASE_PATH = configuredBasePath === "/" ? "" : configuredBasePath;

export type Route = {
  path: string;
  parts: string[];
};

function normalizeRoutePath(path: string): string {
  const value = path.startsWith("/") ? path : `/${path}`;
  return value.replace(/\/+/g, "/") || "/";
}

function isAppPath(pathname: string): boolean {
  if (!APP_BASE_PATH) return pathname.startsWith("/");
  return pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`);
}

function readLegacyHashPath(): string | null {
  const value = window.location.hash.replace(/^#/, "");
  return value.startsWith("/") ? normalizeRoutePath(value) : null;
}

function readBrowserPath(): string {
  const { pathname } = window.location;

  if (!APP_BASE_PATH) return normalizeRoutePath(pathname);

  if (!isAppPath(pathname)) {
    return "/";
  }

  const value = pathname.slice(APP_BASE_PATH.length);
  return normalizeRoutePath(value || "/");
}

function toBrowserPath(path: string): string {
  const routePath = normalizeRoutePath(path);
  if (!APP_BASE_PATH) return routePath;
  return routePath === "/" ? APP_BASE_PATH : `${APP_BASE_PATH}${routePath}`;
}

function syncAddressToBasePath(): void {
  const legacyHashPath = readLegacyHashPath();

  if (!APP_BASE_PATH) {
    if (legacyHashPath) window.history.replaceState({}, "", legacyHashPath);
    return;
  }

  if (!legacyHashPath && isAppPath(window.location.pathname)) {
    return;
  }

  window.history.replaceState({}, "", toBrowserPath(legacyHashPath ?? readBrowserPath()));
}

export function navigate(path: string): void {
  window.history.pushState({}, "", toBrowserPath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateBack(fallbackPath = "/"): void {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  navigate(fallbackPath);
}

export function useAppRoute(): Route {
  const [path, setPath] = useState(readBrowserPath);

  useEffect(() => {
    const onRouteChange = () => setPath(readBrowserPath());

    syncAddressToBasePath();
    onRouteChange();
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);

  return useMemo(
    () => ({
      path,
      parts: path.split("/").filter(Boolean),
    }),
    [path],
  );
}
