import { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface Props {
  src: string;
  alt?: string;
  /** Optional: Click ausserhalb des Bildes aufruft das (z.B. um Lightbox zu schliessen) */
  onBackgroundClick?: () => void;
}

// Bildvorschau mit Zoom (25%-400%) + Pan beim Hineinzoomen.
// Steuerung:
// - Strg/Cmd + Mausrad: Zoom rein/raus
// - Doppelklick: Zoom-Toggle (100% / 200%)
// - Pinch (Touch): Zoom (Browser-nativ via touch-action: pinch-zoom)
// - Drag (mit gedrueckter Maustaste oder einfaches Touch-Drag): Pan bei Zoom > 100%
// - +/- Buttons in der Toolbar
export function ZoomableImage({ src, alt, onBackgroundClick }: Props) {
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; baseTx: number; baseTy: number } | null>(null);

  const reset = () => { setZoom(1); setTx(0); setTy(0); };

  // Bei src-Wechsel reset
  useEffect(() => { reset(); }, [src]);

  const clampZoom = (z: number) => Math.max(0.25, Math.min(4, z));

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // Nur mit Strg/Cmd zoomen
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => clampZoom(z * factor));
  };

  const handleDoubleClick = () => {
    if (zoom === 1) setZoom(2);
    else reset();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, baseTx: tx, baseTy: ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStateRef.current) return;
    const { startX, startY, baseTx, baseTy } = dragStateRef.current;
    setTx(baseTx + (e.clientX - startX));
    setTy(baseTy + (e.clientY - startY));
  };
  const onMouseUp = () => { dragStateRef.current = null; };

  // Touch-Pan (nur bei zoom > 1)
  const onTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1 || e.touches.length !== 1) return;
    const t = e.touches[0];
    dragStateRef.current = { startX: t.clientX, startY: t.clientY, baseTx: tx, baseTy: ty };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragStateRef.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    const { startX, startY, baseTx, baseTy } = dragStateRef.current;
    setTx(baseTx + (t.clientX - startX));
    setTy(baseTy + (t.clientY - startY));
  };
  const onTouchEnd = () => { dragStateRef.current = null; };

  const onContainerClick = (e: React.MouseEvent) => {
    // Klick auf den Hintergrund (nicht auf Bild) schliesst Lightbox - aber nur wenn nicht gezoomt
    if (zoom > 1) return;
    if (e.target === containerRef.current && onBackgroundClick) onBackgroundClick();
  };

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/70 backdrop-blur rounded-md px-2 py-1 text-white">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z / 1.25))}
          className="p-1 hover:bg-white/10 rounded disabled:opacity-30"
          disabled={zoom <= 0.25}
          aria-label="Verkleinern"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs min-w-[3.5rem] text-center font-medium">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z * 1.25))}
          className="p-1 hover:bg-white/10 rounded disabled:opacity-30"
          disabled={zoom >= 4}
          aria-label="Vergroessern"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={reset}
          className="p-1 hover:bg-white/10 rounded ml-1"
          aria-label="Auf 100% zuruecksetzen"
          title="Auf 100% (Doppelklick)"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden select-none"
        style={{ touchAction: zoom > 1 ? "none" : "pinch-zoom", cursor: zoom > 1 ? (dragStateRef.current ? "grabbing" : "grab") : "default" }}
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onContainerClick}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src}
          alt={alt || ""}
          className="max-w-full max-h-full object-contain rounded-lg"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragStateRef.current ? "none" : "transform 120ms ease-out",
          }}
          draggable={false}
        />
      </div>

      <p className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-white/70 text-[10px] hidden sm:block">
        Strg/Cmd + Mausrad zum Zoomen · Doppelklick = Reset
      </p>
    </div>
  );
}
