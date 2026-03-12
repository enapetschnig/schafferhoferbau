import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export type IncomingDocument = {
  id: string;
  project_id: string;
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
}

export function DocumentDetailDialog({ document, open, onOpenChange, isAdmin, onUpdate }: DocumentDetailDialogProps) {
  const { toast } = useToast();
  const [showFullImage, setShowFullImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNotizen, setEditNotizen] = useState("");
  const [editBezahltAm, setEditBezahltAm] = useState("");

  // Initialize edit fields when document changes
  const initEdit = () => {
    if (document) {
      setEditStatus(document.status);
      setEditNotizen(document.notizen || "");
      setEditBezahltAm(document.bezahlt_am || "");
    }
  };

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);

    const updates: Record<string, any> = {
      status: editStatus,
      notizen: editNotizen.trim() || null,
      bezahlt_am: editBezahltAm || null,
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
      <Dialog open={open} onOpenChange={(o) => { if (o) initEdit(); onOpenChange(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Badge className={typInfo.color}>{typInfo.label}</Badge>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
              {document.dokument_nummer && (
                <span className="text-sm font-mono text-muted-foreground">#{document.dokument_nummer}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Photo */}
            <div
              className="cursor-pointer rounded-lg border overflow-hidden bg-muted"
              onClick={() => setShowFullImage(true)}
            >
              <img
                src={document.photo_url}
                alt="Dokument"
                className="w-full max-h-48 object-contain"
              />
            </div>

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
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-size image dialog */}
      <Dialog open={showFullImage} onOpenChange={setShowFullImage}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-auto p-2">
          <img src={document.photo_url} alt="Dokument" className="w-full rounded" />
        </DialogContent>
      </Dialog>
    </>
  );
}
