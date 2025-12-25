import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { toast } from "@/components/ui/sonner";

// Ensure installed PWA/mobile app picks up new builds
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast("Atualização disponível", {
      description: "Toque em Atualizar para carregar a versão mais recente.",
      action: {
        label: "Atualizar",
        onClick: () => updateSW(true),
      },
    });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

