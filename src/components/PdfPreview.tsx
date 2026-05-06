import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
  pdfUrl: string;
  /** Render-Skala der pdfjs-Pages. 1.5 = scharf auf Retina, 1.0 = leichter. Default 1.5. */
  scale?: number;
  className?: string;
}

type PageImage = { pageIndex: number; width: number; height: number; src: string };

// Rendert ein PDF als Liste von PNG-<img>-Elementen via pdfjs-dist.
// Funktioniert plattform-uebergreifend identisch (iOS, Android, Desktop) -
// im Gegensatz zum nativen <iframe>, das auf Android Chrome PDFs nicht
// rendern kann.
export function PdfPreview({ pdfUrl, scale = 1.5, className }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);

    (async () => {
      try {
        const resp = await fetch(pdfUrl);
        if (!resp.ok) throw new Error(`PDF konnte nicht geladen werden (${resp.status})`);
        const buf = await resp.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const result: PageImage[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          result.push({
            pageIndex: i - 1,
            width: viewport.width,
            height: viewport.height,
            src: canvas.toDataURL("image/png"),
          });
          // Inkrementell rendern - User sieht erste Seiten sofort
          if (!cancelled) setPages([...result]);
        }
        if (!cancelled) setLoading(false);
      } catch (err: any) {
        console.error("PdfPreview error:", err);
        if (!cancelled) {
          setError(err?.message || "PDF konnte nicht geladen werden");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl, scale]);

  return (
    <div ref={containerRef} className={className}>
      {error ? (
        <div className="flex items-center justify-center h-full text-sm text-destructive">
          {error}
        </div>
      ) : loading && pages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-sm text-muted-foreground">PDF wird geladen…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          {pages.map((p) => (
            <div key={p.pageIndex} className="relative shadow-md rounded bg-white max-w-full">
              <img
                src={p.src}
                alt={`Seite ${p.pageIndex + 1}`}
                className="block w-full h-auto rounded"
                draggable={false}
              />
              <div className="absolute -top-2 left-2 bg-foreground/80 text-background text-[10px] px-1.5 py-0.5 rounded">
                {p.pageIndex + 1} / {pages.length}
              </div>
            </div>
          ))}
          {loading && pages.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Weitere Seiten werden geladen…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
