import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./shared/styles/global.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {
      // The app remains fully usable online when the optional offline cache cannot register.
    });
  });
}
