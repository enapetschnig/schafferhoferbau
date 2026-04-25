import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Trash2, Upload, Loader2 } from "lucide-react";

export type CapturedPhoto = {
  id: string;
  file: File;
  preview: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird beim Abschliessen aufgerufen mit allen aufgenommenen Files */
  onFinish: (files: File[]) => Promise<void> | void;
  title?: string;
}

/**
 * Serienaufnahme:
 * 1. Kamera oeffnet sich automatisch beim Dialog-Start
 * 2. Foto wird sofort uebernommen und als Thumbnail angezeigt
 * 3. Naechste Aufnahme startet automatisch
 * 4. "Abschliessen" → onFinish callback mit allen Files
 */
export function SerialPhotoCapture({
  open,
  onOpenChange,
  onFinish,
  title = "Serienaufnahme",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [captured, setCaptured] = useState<CapturedPhoto[]>([]);
  const [finishing, setFinishing] = useState(false);

  // Beim Oeffnen: Kamera starten
  useEffect(() => {
    if (open) {
      setCaptured([]);
      setFinishing(false);
      // Kamera oeffnen nach kurzer Verzoegerung (damit der Dialog schon da ist)
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 150);
    } else {
      // Cleanup object-URLs
      captured.forEach(p => URL.revokeObjectURL(p.preview));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // Reset so same file can be re-selected
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCaptured(prev => [...prev, {
      id: crypto.randomUUID(),
      file,
      preview: url,
    }]);
    // Naechste Aufnahme automatisch starten
    setTimeout(() => fileInputRef.current?.click(), 200);
  };

  const removeCaptured = (id: string) => {
    setCaptured(prev => {
      const target = prev.find(p => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  const takeAnother = () => {
    fileInputRef.current?.click();
  };

  const finish = async () => {
    if (captured.length === 0) {
      onOpenChange(false);
      return;
    }
    setFinishing(true);
    try {
      await onFinish(captured.map(p => p.file));
      // Cleanup
      captured.forEach(p => URL.revokeObjectURL(p.preview));
      onOpenChange(false);
    } finally {
      setFinishing(false);
    }
  };

  const cancel = () => {
    captured.forEach(p => URL.revokeObjectURL(p.preview));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); else onOpenChange(o); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {title} {captured.length > 0 && <span className="text-sm text-muted-foreground">({captured.length} aufgenommen)</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Hidden camera input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="space-y-3">
          {captured.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Kamera wird geöffnet... Falls nicht:
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={takeAnother}>
                  <Camera className="w-4 h-4 mr-1" /> Foto aufnehmen
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {captured.length} Foto{captured.length === 1 ? "" : "s"} bereit zum Hochladen
              </p>
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {captured.map(p => (
                  <div key={p.id} className="relative group">
                    <img src={p.preview} alt="" className="aspect-square w-full object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => removeCaptured(p.id)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      title="Entfernen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={takeAnother} disabled={finishing}>
                  <Camera className="w-4 h-4 mr-1" /> Weiteres Foto
                </Button>
                <Button className="flex-1" onClick={finish} disabled={finishing}>
                  {finishing
                    ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Lädt hoch...</>
                    : <><Upload className="w-4 h-4 mr-1" /> Abschließen ({captured.length})</>}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
