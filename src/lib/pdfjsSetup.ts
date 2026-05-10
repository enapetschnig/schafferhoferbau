// Zentraler Setup fuer pdfjs-dist: legt genau EINEN Worker an (mit Polyfills
// fuer aeltere Android-Browser via ./pdfjsWorker.ts) und teilt ihn ueber
// GlobalWorkerOptions.workerPort an alle pdfjs-Aufrufer in der App.
//
// Nutzung in Komponenten:
//   import "@/lib/pdfjsSetup";
//   import * as pdfjsLib from "pdfjs-dist";
//   await pdfjsLib.getDocument(...).promise;
import * as pdfjsLib from "pdfjs-dist";
import PdfjsWorker from "./pdfjsWorker?worker";

if (!pdfjsLib.GlobalWorkerOptions.workerPort) {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();
}
