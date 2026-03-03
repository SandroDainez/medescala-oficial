import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { clearPwaCacheAndReload } from "@/lib/pwa";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
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
  const recovering = sessionStorage.getItem("medescala_chunk_recovering") === "1";
  if (recovering) return;
  sessionStorage.setItem("medescala_chunk_recovering", "1");
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
