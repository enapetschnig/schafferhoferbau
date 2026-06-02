import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Trash2, FileText, X, ChevronLeft, ChevronRight } from "lucide-react";

export type IncomingDocument = {
  id: string;
  project_id: string | null;
  projekt_freitext?: string | null;
  user_id: string;
  typ: string;
  status: string;
  photo_url: string;
  lieferant: string | null;
  dokument_datum: string | null;
  dokument_nummer: string | null;
  betrag: number | null;
  positionen: any;
  unterschrift: string | null;
  unterschrift_name: string | null;
  notizen: string | null;
  bezahlt_am: string | null;
  zusatz_seiten_urls?: string[] | null;
  waren_fotos_urls?: string[] | null;
  ist_retour?: boolean | null;
  ziel_projekt_id?: string | null;
  ziel_projekt_name?: string | null;
  created_at: string;
  project_name?: string;
  employee_name?: string;
};

const TYP_LABELS: Record<string, { label: string; color: string }> = {
  lieferschein: { label: "Lieferschein", color: "bg-blue-100 text-blue-800" },
  lagerlieferschein: { label: "Lagerlieferschein", color: "bg-yellow-100 text-yellow-800" },
  rechnung: { label: "Rechnung", color: "bg-purple-100 text-purple-800" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  offen: { label: "Offen", color: "bg-red-100 text-red-800" },
  bezahlt: { label: "Bezahlt", color: "bg-green-100 text-green-800" },
  storniert: { label: "Storniert", color: "bg-gray-100 text-gray-800" },
};

interface DocumentDetailDialogProps {
  document: IncomingDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onUpdate: () => void;
  onDelete?: () => void;
}

export function DocumentDetailDialog({ document, open, onOpenChange, isAdmin, onUpdate, onDelete }: DocumentDetailDialogProps) {
  const { toast } = useToast();
  // Vollbild-Galerie: eine Liste von URLs (Haupt-Foto + Zusatz-Seiten bilden
  // eine Galerie, Ware-Fotos eine zweite). Index zeigt aktuelles Bild.
  // Leeres Array = Vollbild geschlossen. Wischen ueber den Container blaettert.
  const [fullscreenGallery, setFullscreenGallery] = useState<string[]>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const fullscreenTouchStartX = useRef<number | null>(null);

  const openFullscreen = (urls: string[], index = 0) => {
    if (urls.length === 0) return;
    setFullscreenGallery(urls);
    setFullscreenIndex(Math.max(0, Math.min(urls.length - 1, index)));
  };
  const closeFullscreen = () => {
    setFullscreenGallery([]);
    setFullscreenIndex(0);
  };
  const fullscreenNext = () =>
    setFullscreenIndex((i) => Math.min(fullscreenGallery.length - 1, i + 1));
  const fullscreenPrev = () =>
    setFullscreenIndex((i) => Math.max(0, i - 1));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNotizen, setEditNotizen] = useState("");
  const [editBezahltAm, setEditBezahltAm] = useState("");
  // Kopfdaten (Admin kann Falscheingaben korrigieren / Projekt neu zuordnen)
  const [editProjectId, setEditProjectId] = useState("");
  const [editProjektFreitext, setEditProjektFreitext] = useState("");
  const [editLieferant, setEditLieferant] = useState("");
  const [editDatum, setEditDatum] = useState("");
  const [editBelegnummer, setEditBelegnummer] = useState("");
  const [editBetrag, setEditBetrag] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string; plz: string | null }[]>([]);

  // Projektliste fuer das Admin-Edit-Dropdown laden
  useEffect(() => {
    if (!open || !isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, plz")
        .order("name");
      if (data) setProjects(data);
    })();
  }, [open, isAdmin]);

  // Initialize edit fields when the dialog opens or the document changes.
  // Wichtig: Radix feuert onOpenChange nicht, wenn der Parent open=true setzt,
  // daher muss die Initialisierung hier laufen — sonst bleibt z.B. editStatus ""
  // und der Save verletzt den DB-Check-Constraint auf incoming_documents.status.
  useEffect(() => {
    if (!open || !document) return;
    setEditStatus(document.status || "offen");
    setEditNotizen(document.notizen || "");
    setEditBezahltAm(document.bezahlt_am || "");
    setEditProjectId(document.project_id || "");
    setEditProjektFreitext(document.projekt_freitext || "");
    setEditLieferant(document.lieferant || "");
    setEditDatum(document.dokument_datum || "");
    setEditBelegnummer(document.dokument_nummer || "");
    setEditBetrag(document.betrag != null ? String(document.betrag) : "");
  }, [open, document]);

  const handleDelete = async () => {
    if (!document) return;
    setDeleting(true);
    const { error } = await supabase.from("incoming_documents").delete().eq("id", document.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Dokument gelöscht" });
      onOpenChange(false);
      onDelete?.();
    }
    setDeleting(false);
  };

  const handleSave = async () => {
    if (!document) return;
    // Projekt-Zuordnung pruefen: bestehendes Projekt ODER Freitext
    if (!editProjectId && !editProjektFreitext.trim()) {
      toast({ variant: "destructive", title: "Projekt fehlt", description: "Bitte ein Projekt wählen oder eingeben." });
      return;
    }
    setSaving(true);

    const updates: Record<string, any> = {
      status: editStatus,
      notizen: editNotizen.trim() || null,
      bezahlt_am: editBezahltAm || null,
      project_id: editProjectId || null,
      projekt_freitext: editProjectId ? null : editProjektFreitext.trim(),
      lieferant: editLieferant.trim() || null,
      dokument_datum: editDatum || null,
      dokument_nummer: editBelegnummer.trim() || null,
      betrag: editBetrag ? parseFloat(editBetrag) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("incoming_documents")
      .update(updates)
      .eq("id", document.id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert", description: "Dokument aktualisiert" });
      onUpdate();
    }
    setSaving(false);
  };

  if (!document) return null;

  const typInfo = TYP_LABELS[document.typ] || TYP_LABELS.lieferschein;
  const statusInfo = STATUS_LABELS[document.status] || STATUS_LABELS.offen;
  const positionen = Array.isArray(document.positionen) ? document.positionen : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Badge className={typInfo.color}>{typInfo.label}</Badge>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
              {document.ist_retour && (
                <Badge className="bg-orange-100 text-orange-800">Retour</Badge>
              )}
              {document.dokument_nummer && (
                <span className="text-sm font-mono text-muted-foreground">#{document.dokument_nummer}</span>
              )}
            </DialogTitle>
            {document.ist_retour && (
              <DialogDescription className="text-sm">
                {document.ziel_projekt_name
                  ? <>Umbuchung von <strong>{document.project_name || "Quelle"}</strong> auf <strong>{document.ziel_projekt_name}</strong></>
                  : <>Retoure auf Lager (von {document.project_name || "Quelle"})</>}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Dokument-Vorschau (Bild oder PDF) */}
            {(() => {
              const isPdf = /\.pdf(\?|$)/i.test(document.photo_url);
              if (isPdf) {
                return (
                  <div className="rounded-lg border overflow-hidden bg-muted">
                    <iframe
                      src={`${document.photo_url}#toolbar=1`}
                      title="PDF-Vorschau"
                      className="w-full h-96"
                    />
                    <div className="px-3 py-2 text-xs text-muted-foreground flex justify-between items-center border-t">
                      <span>PDF-Dokument</span>
                      <a
                        href={document.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        In neuem Tab öffnen
                      </a>
                    </div>
                  </div>
                );
              }
              // Dokument-Galerie: Hauptfoto + alle Zusatzseiten
              // zusammen, damit man im Vollbild von einem zum naechsten
              // wischen kann.
              const docGallery = [
                document.photo_url,
                ...(document.zusatz_seiten_urls || []),
              ];
              return (
                <div
                  className="cursor-pointer rounded-lg border overflow-hidden bg-muted"
                  onClick={() => openFullscreen(docGallery, 0)}
                >
                  <img
                    src={document.photo_url}
                    alt="Dokument"
                    className="w-full max-h-96 object-contain"
                  />
                </div>
              );
            })()}

            {/* Weitere Seiten — gemeinsam mit dem Hauptfoto in einer
                wischbaren Vollbild-Galerie. Index = i + 1 weil das Hauptfoto
                am Anfang der Liste steht. */}
            {document.zusatz_seiten_urls && document.zusatz_seiten_urls.length > 0 && (() => {
              const docGallery = [
                document.photo_url,
                ...(document.zusatz_seiten_urls || []),
              ];
              return (
                <div>
                  <span className="text-sm text-muted-foreground">
                    Weitere Seiten ({document.zusatz_seiten_urls.length}):
                  </span>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {document.zusatz_seiten_urls.map((url, i) => {
                      const isPdf = /\.pdf(\?|$)/i.test(url);
                      if (isPdf) {
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => openFullscreen(docGallery, i + 1)}
                            className="flex flex-col items-center justify-center gap-1 h-24 rounded border bg-muted cursor-pointer hover:opacity-80 transition-opacity"
                            title={`Seite ${i + 2} (PDF)`}
                          >
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">PDF</span>
                          </button>
                        );
                      }
                      return (
                        <img
                          key={i}
                          src={url}
                          alt={`Seite ${i + 2}`}
                          className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80"
                          onClick={() => openFullscreen(docGallery, i + 1)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Fotos der Ware — eigene Galerie, unabhaengig vom Dokument-Foto. */}
            {document.waren_fotos_urls && document.waren_fotos_urls.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">
                  Fotos der Ware ({document.waren_fotos_urls.length}):
                </span>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {document.waren_fotos_urls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Ware ${i + 1}`}
                      className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80"
                      onClick={() => openFullscreen(document.waren_fotos_urls!, i)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Lieferant</p>
                <p className="font-medium">{document.lieferant || "–"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Datum</p>
                <p className="font-medium">
                  {document.dokument_datum
                    ? format(new Date(document.dokument_datum), "dd.MM.yyyy", { locale: de })
                    : "–"}
                </p>
              </div>
              {(isAdmin || document.typ !== "rechnung") && (
                <div>
                  <p className="text-muted-foreground">Betrag</p>
                  <p className="font-medium">
                    {document.betrag != null ? `€ ${Number(document.betrag).toFixed(2)}` : "–"}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Projekt</p>
                <p className="font-medium">{document.project_name || "–"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Erfasst von</p>
                <p className="font-medium">{document.employee_name || "–"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Erfasst am</p>
                <p className="font-medium">
                  {format(new Date(document.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                </p>
              </div>
            </div>

            {/* Positions */}
            {positionen.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Positionen</Label>
                <div className="overflow-x-auto mt-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Menge</TableHead>
                        <TableHead>Einheit</TableHead>
                        <TableHead className="text-right">Preis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positionen.map((pos: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{pos.material}</TableCell>
                          <TableCell>{pos.menge}</TableCell>
                          <TableCell>{pos.einheit}</TableCell>
                          <TableCell className="text-right">{pos.preis ? `€ ${pos.preis}` : "–"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Signature */}
            {document.unterschrift && (
              <div>
                <Label className="text-sm font-medium">Unterschrift</Label>
                <div className="mt-1 p-2 border rounded bg-white">
                  <img src={document.unterschrift} alt="Unterschrift" className="max-h-20" />
                  {document.unterschrift_name && (
                    <p className="text-xs text-muted-foreground mt-1">{document.unterschrift_name}</p>
                  )}
                </div>
              </div>
            )}

            {/* Admin edit section */}
            {isAdmin && (
              <div className="border-t pt-4 space-y-3">
                <Label className="text-base font-semibold">Admin-Bereich</Label>

                {/* Kopfdaten korrigieren / Projekt neu zuordnen */}
                <div className="space-y-2">
                  <Label>Projekt / Baustelle</Label>
                  <Select
                    value={editProjectId}
                    onValueChange={(v) => { setEditProjectId(v); setEditProjektFreitext(""); }}
                    disabled={!!editProjektFreitext.trim()}
                  >
                    <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}{p.plz ? ` (${p.plz})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={editProjektFreitext}
                    onChange={(e) => {
                      setEditProjektFreitext(e.target.value);
                      if (e.target.value.trim()) setEditProjectId("");
                    }}
                    placeholder="Oder freier Projektname (nicht angelegtes Projekt)"
                    className="text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Lieferant</Label>
                    <Input value={editLieferant} onChange={(e) => setEditLieferant(e.target.value)} placeholder="Lieferant" />
                  </div>
                  <div>
                    <Label>Datum</Label>
                    <Input type="date" value={editDatum} onChange={(e) => setEditDatum(e.target.value)} />
                  </div>
                  <div>
                    <Label>Belegnummer</Label>
                    <Input value={editBelegnummer} onChange={(e) => setEditBelegnummer(e.target.value)} placeholder="Belegnummer" />
                  </div>
                  {document.typ === "rechnung" && (
                    <div className="col-span-2">
                      <Label>Betrag (€)</Label>
                      <Input type="number" step="0.01" value={editBetrag} onChange={(e) => setEditBetrag(e.target.value)} placeholder="0.00" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offen">Offen</SelectItem>
                        <SelectItem value="bezahlt">Bezahlt</SelectItem>
                        <SelectItem value="storniert">Storniert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bezahlt am</Label>
                    <Input type="date" value={editBezahltAm} onChange={(e) => setEditBezahltAm(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Notizen</Label>
                  <Textarea
                    value={editNotizen}
                    onChange={(e) => setEditNotizen(e.target.value)}
                    placeholder="Anmerkungen..."
                    rows={2}
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Speichere..." : "Änderungen speichern"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={deleting}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Dokument löschen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Das Dokument wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Vollbild-Galerie — wischbar links/rechts. Eigener grosser X-Button
          (auf iOS war der shadcn-Default zu klein), Pfeile fuer Desktop,
          Index-Anzeige bei Multi-Bild-Galerie. Default-Close-Button von
          DialogContent wird per [&>button]:hidden weggeblendet. */}
      <Dialog
        open={fullscreenGallery.length > 0}
        onOpenChange={(o) => { if (!o) closeFullscreen(); }}
      >
        <DialogContent
          className="max-w-5xl h-[95vh] p-0 flex flex-col bg-black border-0 [&>button]:hidden"
        >
          {fullscreenGallery.length > 0 && (() => {
            const currentUrl = fullscreenGallery[fullscreenIndex];
            const isPdf = /\.pdf(\?|$)/i.test(currentUrl);
            const hasPrev = fullscreenIndex > 0;
            const hasNext = fullscreenIndex < fullscreenGallery.length - 1;
            return (
              <div
                className="relative flex-1 flex items-center justify-center overflow-hidden touch-pan-y"
                onTouchStart={(e) => {
                  if (isPdf) return;
                  fullscreenTouchStartX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  if (isPdf) return;
                  const start = fullscreenTouchStartX.current;
                  fullscreenTouchStartX.current = null;
                  if (start == null) return;
                  const dx = e.changedTouches[0].clientX - start;
                  if (Math.abs(dx) < 50) return;
                  if (dx < 0) fullscreenNext();
                  else fullscreenPrev();
                }}
              >
                {isPdf ? (
                  <iframe
                    src={`${currentUrl}#toolbar=1`}
                    title="PDF-Vorschau"
                    className="w-full h-full bg-white"
                  />
                ) : (
                  <img
                    src={currentUrl}
                    alt="Dokument"
                    className="max-w-full max-h-full object-contain select-none"
                    draggable={false}
                  />
                )}

                {/* Grosser X-Button oben rechts — leicht zu treffen auf iOS
                    (44x44pt sind Apple-Mindestmass). */}
                <button
                  type="button"
                  onClick={closeFullscreen}
                  className="absolute top-3 right-3 h-12 w-12 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 active:bg-black z-20 shadow-lg"
                  aria-label="Schließen"
                >
                  <X className="h-6 w-6" />
                </button>

                {/* Vor/Zurueck-Pfeile fuer Desktop und Tap (alternativ zum
                    Wisch). Bei nur einem Bild nicht anzeigen. */}
                {fullscreenGallery.length > 1 && hasPrev && (
                  <button
                    type="button"
                    onClick={fullscreenPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 z-10"
                    aria-label="Vorheriges Bild"
                  >
                    <ChevronLeft className="h-7 w-7" />
                  </button>
                )}
                {fullscreenGallery.length > 1 && hasNext && (
                  <button
                    type="button"
                    onClick={fullscreenNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 z-10"
                    aria-label="Nächstes Bild"
                  >
                    <ChevronRight className="h-7 w-7" />
                  </button>
                )}

                {/* Index-Indikator unten mittig. */}
                {fullscreenGallery.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full z-10">
                    {fullscreenIndex + 1} / {fullscreenGallery.length}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
