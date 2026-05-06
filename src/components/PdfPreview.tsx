import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
  pdfUrl: string;
  /**
   * Zoom-Faktor relativ zur Container-Breite. 1.0 = passt auf Container-Breite (Default).
   * 0.5 = halbe Breite (Gesamtansicht von z.B. A0-Plaenen). 2.0 = doppelte Breite (Detail).
   */
  zoom?: number;
  className?: string;
}

type PageImage = { pageIndex: number; pageCount: number; src: string; aspectRatio: number };

// PDF-Render via pdfjs-dist + Canvas → Blob-URL.
// canvas.toBlob() statt toDataURL(): iOS Safari hat ein 5MB-Limit fuer
// DataURLs, das bei A0-Plaenen oder mehrseitigen PDFs ueberschritten wurde
// und dazu fuehrte, dass nur die erste Seite angezeigt wurde.
export function PdfPreview({ pdfUrl, zoom = 1.0, className }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    // Alte Blob-URLs freigeben
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];

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
          // Adaptive Render-Skala: grosse Seiten (A0) nicht ueber 3000px breit
          // rendern, sonst bricht iOS Safari mit Memory-Error ab.
          const baseViewport = page.getViewport({ scale: 1.0 });
          const targetWidth = Math.min(3000, baseViewport.width * 1.5);
          const renderScale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;

          // canvas → Blob (statt DataURL - iOS-freundlich)
          const blob: Blob | null = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/png");
          });
          if (!blob) continue;

          const url = URL.createObjectURL(blob);
          blobUrlsRef.current.push(url);

          result.push({
            pageIndex: i - 1,
            pageCount: pdf.numPages,
            src: url,
            aspectRatio: viewport.width / viewport.height,
          });
          if (!cancelled) setPages([...result]);

          // Canvas explizit aufraeumen (iOS Memory-Druck reduzieren)
          canvas.width = 0;
          canvas.height = 0;
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

    return () => {
      cancelled = true;
      // Beim Unmount alle Blob-URLs freigeben
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
    };
  }, [pdfUrl]);

  return (
    <div className={className}>
      {error ? (
        <div className="flex items-center justify-center h-full text-sm text-destructive p-4">
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
            <div
              key={p.pageIndex}
              className="relative shadow-md rounded bg-white shrink-0"
              style={{ width: `${zoom * 100}%` }}
            >
              <img
                src={p.src}
                alt={`Seite ${p.pageIndex + 1}`}
                className="block w-full h-auto rounded"
                draggable={false}
              />
              <div className="absolute -top-2 left-2 bg-foreground/80 text-background text-[10px] px-1.5 py-0.5 rounded">
                {p.pageIndex + 1} / {p.pageCount}
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
