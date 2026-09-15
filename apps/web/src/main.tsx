import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/app/App";
import "@/index.css";
import { assertProductionEnv } from "@/config/env";
import { setupAppServiceWorker } from "@/lib/pwa/registerAppSw";

assertProductionEnv();
setupAppServiceWorker();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
