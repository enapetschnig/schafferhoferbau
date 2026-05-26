import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Info, Camera } from "lucide-react";
import { sanitizeStorageFileName } from "@/lib/storageFileName";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { SerialPhotoCapture } from "@/components/SerialPhotoCapture";

type DocumentType = "plans" | "reports" | "materials" | "photos";

interface QuickUploadDialogProps {
  /** Wenn gesetzt, ist das Projekt fix. Sonst zeigt der Dialog eine Projektauswahl. */
  projectId?: string;
  documentType?: DocumentType;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const bucketMap: Record<DocumentType, string> = {
  plans: "project-plans",
  reports: "project-reports",
  materials: "project-materials",
  photos: "project-photos",
};

const titleMap: Record<DocumentType, string> = {
  plans: "Pläne",
  reports: "Regieberichte",
  materials: "Materiallisten",
  photos: "Fotos",
};

export function QuickUploadDialog({ 
  projectId, 
  documentType = "photos", 
  open, 
  onClose,
  onSuccess 
}: QuickUploadDialogProps) {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Projektauswahl, wenn keine projectId vorgegeben ist
  const [projects, setProjects] = useState<{ id: string; name: string; plz: string | null }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const effectiveProjectId = projectId || selectedProjectId;

  useEffect(() => {
    if (!open || projectId) return;
    setSelectedProjectId("");
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, plz")
        .in("status", ["aktiv", "in_planung"])
        .order("name");
      setProjects(data || []);
    })();
  }, [open, projectId]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Eigene Kamera-UI (MobilePhotoCapture via getUserMedia) statt nativer
  // Samsung-Kamera-App. Verhindert PWA-Killing auf Android-Standalone-Apps.
  const [showInAppCamera, setShowInAppCamera] = useState(false);

  // Dateien anhaengen (nicht ersetzen) — so kann man mehrere Fotos
  // nacheinander aufnehmen und zusaetzlich aus der Galerie waehlen.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
    e.target.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (!effectiveProjectId) {
      toast({ variant: "destructive", title: "Projekt fehlt", description: "Bitte zuerst ein Projekt wählen." });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const bucket = bucketMap[documentType];
    // sub_type "plan" fuer Plaene-Uploads, damit die Datei im Tab
    // "Aktuelle Pläne" erscheint (analog zum Upload direkt in der
    // Plaene-Ansicht). Andere Typen haben keinen sub_type.
    const subType = documentType === "plans" ? "plan" : null;
    let successCount = 0;

    const { data: { user } } = await supabase.auth.getUser();

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const filePath = `${effectiveProjectId}/${Date.now()}_${sanitizeStorageFileName(file.name)}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage-Upload-Fehler:', uploadError);
        console.error('Datei:', file.name, 'Größe:', file.size, 'bytes');
        toast({
          variant: "destructive",
          title: "Upload fehlgeschlagen",
          description: `${file.name} (${(file.size / 1024).toFixed(0)} KB): ${uploadError.message}`
        });
        setUploading(false);
        return;
      }

      if (uploadData) {
        // DB-Record anlegen, damit die Datei in der jeweiligen Ansicht
        // auftaucht und nicht nur im Storage liegt.
        if (user) {
          const { error: docError } = await supabase.from("documents").insert({
            name: file.name,
            project_id: effectiveProjectId,
            typ: documentType,
            sub_type: subType,
            file_url: filePath,
            user_id: user.id,
            archived: false,
          });
          if (docError) {
            console.error("documents-Record-Fehler:", docError);
            toast({
              variant: "destructive",
              title: "Upload unvollständig",
              description: `${file.name}: Datei gespeichert, aber Eintrag fehlgeschlagen — ${docError.message}`,
            });
          }
        }
        successCount++;
      }

      setUploadProgress(((i + 1) / selectedFiles.length) * 100);
    }

    setUploading(false);

    if (successCount > 0) {
      toast({
        title: "Erfolg",
        description: `${successCount} von ${selectedFiles.length} Datei(en) hochgeladen`,
      });
      
      if (onSuccess) {
        onSuccess();
      }
      
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadProgress(0);
        onClose();
      }, 500);
    } else {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Dateien konnten nicht hochgeladen werden",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleMap[documentType]} hochladen</DialogTitle>
          <DialogDescription>
            Wähle Dateien zum Hochladen aus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Projektauswahl — nur wenn keine projectId vorgegeben */}
          {!projectId && (
            <div className="space-y-1.5">
              <Label>Projekt / Baustelle *</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={uploading}>
                <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.plz ? ` (${p.plz})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Foto aufnehmen — eigene In-App-Kamera (getUserMedia) statt
              nativer Samsung-Kamera-App. Verhindert das PWA-Killing auf
              Android-Standalone-Apps (siehe MobilePhotoCapture). */}
          {documentType === "photos" && (
            <>
              <Button
                type="button"
                onClick={() => setShowInAppCamera(true)}
                disabled={uploading}
                className="w-full"
                size="lg"
              >
                <Camera className="h-5 w-5 mr-2" />
                Foto aufnehmen
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                oder Datei(en) auswählen
              </p>
            </>
          )}

          {/* Drag & Drop Zone */}
          <label htmlFor="file-upload" className="cursor-pointer">
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                Dateien auswählen
              </p>
              <p className="text-xs text-muted-foreground">
                Klicken zum Auswählen oder Drag & Drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Max. 50 MB pro Datei
              </p>
            </div>
            <Input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
              {...(documentType === "photos" ? { accept: "image/*" } : {})}
              multiple
            />
          </label>

          {/* Hinweis für Google Fotos */}
          {documentType === "photos" && (
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1">💡 Fotos aus Google Fotos hochladen?</p>
                <p>Öffne die Google Fotos App → Wähle Foto(s) → Teilen → <strong>"Bild sichern"</strong> (speichert in Fotomediathek) oder <strong>"In Dateien sichern"</strong> → Dann hier hochladen.</p>
              </div>
            </div>
          )}

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Ausgewählte Dateien ({selectedFiles.length})
              </p>
              {selectedFiles.map((file, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted rounded-lg"
                >
                  <span className="text-sm truncate flex-1 min-w-0">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(index)}
                    disabled={uploading}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-xs text-center text-muted-foreground">
                {Math.round(uploadProgress)}% hochgeladen
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={uploading}
              className="flex-1"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploading || !effectiveProjectId}
              className="flex-1"
            >
              {uploading ? "Lädt hoch..." : "Hochladen"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Vollbild-Serien-Kamera (getUserMedia). 1 Tap = 1 Foto, Stream
          bleibt offen — siehe SerialPhotoCapture. Fotos werden der
          Datei-Liste hinzugefuegt, Upload erst per Hauptdialog-Button. */}
      <SerialPhotoCapture
        open={showInAppCamera}
        onOpenChange={setShowInAppCamera}
        title="Fotos aufnehmen"
        onFinish={(files) => {
          setSelectedFiles((prev) => [...prev, ...files]);
        }}
      />
    </Dialog>
  );
}
