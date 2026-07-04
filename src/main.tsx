import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { clearPwaCacheAndReload, forcePwaUpdateCheck } from "@/lib/pwa";

sessionStorage.removeItem("medescala_chunk_recovering");
sessionStorage.removeItem("medescala_chunk_retry_done");

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
});

let lastPwaUpdateCheckAt = 0;

// ID desta versão em execução (injetado no build pelo vite.config).
declare const __APP_BUILD_ID__: string;
const RUNTIME_BUILD_ID = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "";

// Compara a versão rodando com a publicada (version.json, servido sem cache).
// Se forem diferentes, limpa cache e recarrega — propaga a atualização mesmo em
// PWAs teimosos (ex.: iPhone instalado na tela inicial). Guarda anti-loop:
// só tenta recarregar uma vez por versão publicada.
async function checkAppVersion() {
  if (!RUNTIME_BUILD_ID) return;
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: unknown };
    const latest = typeof data?.buildId === "string" ? data.buildId : "";
    if (!latest || latest === RUNTIME_BUILD_ID) return;

    const guardKey = "medescala_version_reload_for";
    if (sessionStorage.getItem(guardKey) === latest) return; // já tentamos para esta versão
    sessionStorage.setItem(guardKey, latest);
    await clearPwaCacheAndReload();
  } catch {
    // rede indisponível — ignora e tenta na próxima checagem
  }
}

function shouldRunPwaUpdateCheck() {
  const now = Date.now();
  if (now - lastPwaUpdateCheckAt < 15000) return false;
  lastPwaUpdateCheckAt = now;
  return true;
}

function requestPwaUpdateCheck() {
  if (!shouldRunPwaUpdateCheck()) return;
  void checkAppVersion();
  void forcePwaUpdateCheck(updateSW);
}

const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
if (navEntry?.type === "reload") {
  requestPwaUpdateCheck();
}

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

window.addEventListener("focus", requestPwaUpdateCheck);
window.addEventListener("pageshow", requestPwaUpdateCheck);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestPwaUpdateCheck();
  }
});

// Checagem imediata no carregamento: um app parado numa versão antiga detecta e
// se atualiza já na abertura, sem depender de foco/reload.
void checkAppVersion();

// Checagem periódica: garante que sessões longas abertas (ex.: admin com o app
// aberto o dia todo) também recebam a versão nova sem precisar reabrir.
setInterval(() => {
  if (document.visibilityState === "visible") {
    requestPwaUpdateCheck();
  }
}, 60000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
