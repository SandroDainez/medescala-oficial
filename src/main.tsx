import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { clearPwaCacheAndReload } from "./lib/pwa";

declare const __APP_BUILD_ID__: string;

// Ensure installed PWA/mobile app picks up new builds
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Force-refresh to avoid users being stuck on an older cached build
    updateSW(true);
  },
});

function isChunkLoadErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("chunkloaderror") ||
    normalized.includes("loading chunk")
  );
}

function triggerSingleChunkRecovery() {
  const alreadyRetried = sessionStorage.getItem("medescala_chunk_retry_done") === "1";
  if (alreadyRetried) return;
  sessionStorage.setItem("medescala_chunk_retry_done", "1");
  void clearPwaCacheAndReload();
}

window.addEventListener("error", (event) => {
  const msg = (event?.message || "").toString();
  if (msg && isChunkLoadErrorMessage(msg)) {
    triggerSingleChunkRecovery();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = (event as PromiseRejectionEvent)?.reason;
  const msg =
    typeof reason === "string"
      ? reason
      : (reason as { message?: string } | null | undefined)?.message || "";
  if (msg && isChunkLoadErrorMessage(msg)) {
    triggerSingleChunkRecovery();
  }
});

// Hard guarantee: when build id changes, purge old caches once.
const lastBuildId = localStorage.getItem("medescala_build_id");
if (lastBuildId !== __APP_BUILD_ID__) {
  localStorage.setItem("medescala_build_id", __APP_BUILD_ID__);
  void clearPwaCacheAndReload();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
