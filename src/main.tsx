import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/inter";
// Títulos do tema-base (PRINT3D); outras fontes escolhidas no Admin carregam sob pedido (src/theme/fonts.ts).
import "@fontsource-variable/cormorant-garamond";
import "./index.css";
import { bootTheme } from "./theme/boot";

// Cores e fontes da marca antes do primeiro desenho (ver src/theme/boot.ts).
bootTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
