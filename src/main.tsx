import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
console.log('ENV URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('ENV KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY)

// Ensure installed PWA/mobile app picks up new builds
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Force-refresh to avoid users being stuck on an older cached build
    updateSW(true);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

