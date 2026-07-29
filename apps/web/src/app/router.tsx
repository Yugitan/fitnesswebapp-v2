import { useEffect, useMemo, useState } from "react";

export type Route = {
  path: string;
  parts: string[];
};

function readHashPath(): string {
  const value = window.location.hash.replace(/^#/, "");
  return value || "/";
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function navigateBack(fallbackPath = "/"): void {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  navigate(fallbackPath);
}

export function useHashRoute(): Route {
  const [path, setPath] = useState(readHashPath);

  useEffect(() => {
    const onHashChange = () => setPath(readHashPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return useMemo(
    () => ({
      path,
      parts: path.split("/").filter(Boolean),
    }),
    [path],
  );
}
