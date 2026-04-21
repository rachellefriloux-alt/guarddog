import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for PWA install + offline shell + Web Push.
// Skipped in dev because Vite serves over HMR and a SW would intercept HMR
// requests. Only takes effect on the built bundle.
if (
  "serviceWorker" in navigator &&
  typeof window !== "undefined" &&
  window.location.protocol !== "file:" &&
  !import.meta.env.DEV
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => console.warn("[GuardDog] service worker registration failed:", err));
  });
}
