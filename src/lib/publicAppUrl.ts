const FALLBACK_PUBLIC_URL = "https://medescala-oficial.vercel.app";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicAppBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (envUrl) return trimTrailingSlashes(envUrl);

  if (typeof window === "undefined") return FALLBACK_PUBLIC_URL;

  const origin = window.location.origin;
  if (origin.startsWith("capacitor://") || origin.includes("localhost")) {
    return FALLBACK_PUBLIC_URL;
  }

  return trimTrailingSlashes(origin);
}

export function buildPublicAppUrl(path: string): string {
  const base = getPublicAppBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
