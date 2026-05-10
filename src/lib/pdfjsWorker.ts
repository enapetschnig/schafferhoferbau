// Wird via `?worker` als Web Worker gebundlet. Polyfillt zuerst die in
// aelteren Android-Chrome-Versionen fehlenden ES2025-Methoden auf
// Uint8Array (siehe ./polyfills.ts) und delegiert dann an den
// pdfjs-dist Worker, der seine Message-Handler beim Laden selber
// auf `self` registriert.
import "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";
