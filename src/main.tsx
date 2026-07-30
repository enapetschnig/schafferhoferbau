import "./lib/polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ---------------------------------------------------------------------------
// PWA: neue Version sofort uebernehmen.
//
// Der Workbox-Service-Worker (registerType "autoUpdate" + skipWaiting +
// clientsClaim, siehe vite.config.ts) installiert sich zwar selbst, laedt die
// bereits offene Seite aber NICHT neu. Navigationen werden aus dem Precache
// bedient. Folge: eine installierte PWA laeuft nach einem Deploy so lange auf
// dem ALTEN JS-Bundle, bis der Nutzer die App komplett schliesst und neu
// startet — auf Baustellen-Handys oft tagelang nicht.
//
// Real aufgetreten: nach dem Lesebestaetigungs-Deploy hat ein Mitarbeiter
// Nachrichten gelesen und beantwortet, aber keine Lesebestaetigung erzeugt,
// weil der neue Code auf seinem Geraet schlicht noch nicht existierte.
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  // Merken, ob die Seite schon von einem SW kontrolliert wird. Bei der
  // ERSTinstallation feuert controllerchange ebenfalls — dann darf nicht
  // neu geladen werden (sonst Reload direkt nach dem ersten Seitenaufruf).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  const checkForUpdate = () => {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {
        /* offline o.ae. — beim naechsten Versuch erneut */
      });
  };

  // Ohne aktiven Check sucht der Browser nur beim Seitenaufruf nach Updates.
  // PWAs bleiben tagelang im Hintergrund, darum zusaetzlich pruefen, sobald
  // die App wieder in den Vordergrund kommt — plus stuendlich als Fallback.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  window.setInterval(checkForUpdate, 60 * 60 * 1000);
}

createRoot(document.getElementById("root")!).render(<App />);
