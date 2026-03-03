const CANONICAL_PUBLIC_URL = "https://app.medescalas.com.br";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicAppBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (envUrl) {
    const normalizedEnv = trimTrailingSlashes(envUrl);
    if (!normalizedEnv.includes(".vercel.app")) {
      return normalizedEnv;
    }
  }

  if (typeof window === "undefined") return CANONICAL_PUBLIC_URL;

  const origin = window.location.origin;
  if (
    origin.startsWith("capacitor://") ||
    origin.includes("localhost") ||
    origin.includes(".vercel.app")
  ) {
    return CANONICAL_PUBLIC_URL;
  }

  return trimTrailingSlashes(origin);
}

export function buildPublicAppUrl(path: string): string {
  const base = getPublicAppBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
