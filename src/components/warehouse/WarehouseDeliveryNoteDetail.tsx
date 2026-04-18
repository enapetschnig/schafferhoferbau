import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { TRANSFER_TYPE_LABELS, type WarehouseDeliveryNote } from "@/types/warehouse";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: WarehouseDeliveryNote | null;
  onUpdate?: () => void;
}

export function WarehouseDeliveryNoteDetail({ open, onOpenChange, note, onUpdate }: Props) {
  const { toast } = useToast();
  const [showPhoto, setShowPhoto] = useState<string | null>(null);
  const [kundeVerrechnet, setKundeVerrechnet] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKundeVerrechnet(!!note?.kunde_verrechnet);
  }, [note?.id, note?.kunde_verrechnet]);

  const handleToggleVerrechnet = async (checked: boolean) => {
    if (!note) return;
    setKundeVerrechnet(checked);
    setSaving(true);
    const { error } = await supabase
      .from("warehouse_delivery_notes")
      .update({ kunde_verrechnet: checked })
      .eq("id", note.id);
    setSaving(false);
    if (error) {
      setKundeVerrechnet(!checked);
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: checked ? "Als verrechnet markiert" : "Als nicht verrechnet markiert" });
    onUpdate?.();
  };

  if (!note) return null;

  const typeInfo = TRANSFER_TYPE_LABELS[note.transfer_type];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Lieferschein
              <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Datum:</span>
                <p className="font-medium">
                  {format(new Date(note.datum), "dd.MM.yyyy", { locale: de })}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Mitarbeiter:</span>
                <p className="font-medium">{note.employee_name || "–"}</p>
              </div>
              {note.source_project_name && (
                <div>
                  <span className="text-muted-foreground">Von Baustelle:</span>
                  <p className="font-medium">{note.source_project_name}</p>
                </div>
              )}
              {note.target_project_name && (
                <div>
                  <span className="text-muted-foreground">Nach Baustelle:</span>
                  <p className="font-medium">{note.target_project_name}</p>
                </div>
              )}
            </div>

            {note.notizen && (
              <div className="text-sm">
                <span className="text-muted-foreground">Notizen:</span>
                <p>{note.notizen}</p>
              </div>
            )}

            {/* Kunde verrechnet Toggle */}
            <div className={`flex items-center justify-between p-3 rounded-lg border-2 ${kundeVerrechnet ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/20"}`}>
              <div>
                <p className="text-sm font-medium">
                  Kunde verrechnet: <span className={kundeVerrechnet ? "text-green-700" : "text-red-700"}>
                    {kundeVerrechnet ? "Ja" : "Nein"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {kundeVerrechnet ? "Dieser Lieferschein wurde dem Kunden bereits verrechnet." : "Noch nicht an Kunden verrechnet."}
                </p>
              </div>
              <Switch
                checked={kundeVerrechnet}
                onCheckedChange={handleToggleVerrechnet}
                disabled={saving}
              />
            </div>

            {/* Positionen */}
            {note.items && note.items.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Positionen:</span>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead>Einheit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {note.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.menge}</TableCell>
                        <TableCell>{item.product_einheit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Photos */}
            {note.photo_urls && note.photo_urls.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Fotos:</span>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {note.photo_urls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80"
                      onClick={() => setShowPhoto(url)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Unterschrift */}
            {note.unterschrift && (
              <div>
                <span className="text-sm text-muted-foreground">
                  Unterschrift{note.unterschrift_name ? ` — ${note.unterschrift_name}` : ""}:
                </span>
                <img
                  src={note.unterschrift}
                  alt="Unterschrift"
                  className="mt-1 max-h-20 border rounded bg-white p-1"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen photo */}
      <Dialog open={!!showPhoto} onOpenChange={() => setShowPhoto(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto p-2">
          {showPhoto && <img src={showPhoto} alt="Foto" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
