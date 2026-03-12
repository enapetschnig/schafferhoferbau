import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, ArrowRightLeft, AlertTriangle, Camera, Receipt, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Project = { id: string; name: string };
type Transfer = {
  id: string; von_typ: string; von_project_id: string | null;
  nach_typ: string; nach_project_id: string | null;
  transferiert_am: string; transferiert_von: string; notizen: string | null;
};

const KATEGORIE_LABELS: Record<string, string> = {
  werkzeug: "Werkzeug", maschine: "Maschine", fahrzeug: "Fahrzeug",
  geruest: "Gerüst", sicherheitsausruestung: "Sicherheitsausrüstung",
};
const ZUSTAND_LABELS: Record<string, string> = {
  gut: "Gut", beschaedigt: "Beschädigt", in_reparatur: "In Reparatur", ausgemustert: "Ausgemustert",
};
const ZUSTAND_COLORS: Record<string, string> = {
  gut: "bg-green-100 text-green-800", beschaedigt: "bg-yellow-100 text-yellow-800",
  in_reparatur: "bg-orange-100 text-orange-800", ausgemustert: "bg-gray-100 text-gray-500",
};

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [item, setItem] = useState<any>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Wartung dialog
  const [showWartung, setShowWartung] = useState(false);
  const [wartungDurchgefuehrtAm, setWartungDurchgefuehrtAm] = useState("");
  const [naechsteWartungNeu, setNaechsteWartungNeu] = useState("");
  const [savingWartung, setSavingWartung] = useState(false);

  // Transfer dialog
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTyp, setTransferTyp] = useState("lager");
  const [transferProjectId, setTransferProjectId] = useState("");
  const [transferNotizen, setTransferNotizen] = useState("");
  const [transferring, setTransferring] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setIsAdmin(roleData?.role === "administrator");
    }

    const { data: eq } = await supabase.from("equipment").select("*").eq("id", id).single();
    if (eq) setItem(eq);

    const { data: tr } = await supabase.from("equipment_transfers").select("*").eq("equipment_id", id).order("transferiert_am", { ascending: false });
    if (tr) setTransfers(tr as any);

    const { data: proj } = await supabase.from("projects").select("id, name").order("name");
    if (proj) {
      setProjects(proj.filter((p: any) => p));
      setProjectMap(Object.fromEntries(proj.map((p: any) => [p.id, p.name])));
    }

    const { data: profs } = await supabase.from("profiles").select("id, vorname, nachname");
    if (profs) setProfiles(Object.fromEntries(profs.map((p: any) => [p.id, `${p.vorname} ${p.nachname}`])));

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTransfer = async () => {
    if (!id) return;
    setTransferring(true);

    const { error } = await supabase.rpc("transfer_equipment", {
      p_equipment_id: id,
      p_nach_typ: transferTyp,
      p_nach_project_id: transferTyp === "baustelle" ? transferProjectId || null : null,
      p_notizen: transferNotizen.trim() || null,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Umgelagert" });
      setShowTransfer(false);
      setTransferNotizen("");
      fetchData();
    }
    setTransferring(false);
  };

  const handleWartungDurchgefuehrt = async () => {
    setSavingWartung(true);
    const { error } = await supabase
      .from("equipment")
      .update({ naechste_wartung: naechsteWartungNeu || null })
      .eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Wartung erfasst", description: naechsteWartungNeu ? `Nächste Wartung: ${new Date(naechsteWartungNeu).toLocaleDateString("de-AT")}` : undefined });
      setShowWartung(false);
      fetchData();
    }
    setSavingWartung(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("equipment").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht" });
      navigate("/equipment");
    }
  };

  const isOverdue = item?.naechste_wartung && new Date(item.naechste_wartung) < new Date();
  const isSoon = item?.naechste_wartung && !isOverdue && (new Date(item.naechste_wartung).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 14;

  const locationLabel = (typ: string, projectId: string | null) =>
    typ === "lager" ? "Lager" : (projectId && projectMap[projectId]) || "Baustelle";

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Lade...</p></div>;
  if (!item) return <div className="flex items-center justify-center min-h-screen"><p>Gerät nicht gefunden</p></div>;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/equipment")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold flex-1">{item.name}</h1>
        <Badge variant="outline">{KATEGORIE_LABELS[item.kategorie]}</Badge>
        <Badge className={ZUSTAND_COLORS[item.zustand]}>{ZUSTAND_LABELS[item.zustand]}</Badge>
      </div>

      <div className="space-y-4">
        {/* Photos */}
        {(item.foto_url || item.rechnung_foto_url) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {item.foto_url && (
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                    <Camera className="w-4 h-4" /> Gerätefoto
                  </div>
                  <img
                    src={item.foto_url}
                    alt={item.name}
                    className="w-full h-48 object-cover rounded-md border cursor-pointer"
                    onClick={() => window.open(item.foto_url, "_blank")}
                  />
                </CardContent>
              </Card>
            )}
            {item.rechnung_foto_url && (
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                    <Receipt className="w-4 h-4" /> Rechnung
                  </div>
                  <img
                    src={item.rechnung_foto_url}
                    alt="Rechnung"
                    className="w-full h-48 object-cover rounded-md border cursor-pointer"
                    onClick={() => window.open(item.rechnung_foto_url, "_blank")}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Info */}
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div><span className="text-muted-foreground">Standort:</span> <strong>{locationLabel(item.standort_typ, item.standort_project_id)}</strong></div>
              {item.seriennummer && <div><span className="text-muted-foreground">Seriennr.:</span> {item.seriennummer}</div>}
              {item.kaufdatum && <div><span className="text-muted-foreground">Kaufdatum:</span> {new Date(item.kaufdatum).toLocaleDateString("de-AT")}</div>}
              {item.naechste_wartung && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Wartung:</span>
                  <span className={isOverdue ? "text-destructive font-bold" : isSoon ? "text-orange-600 font-medium" : ""}>
                    {new Date(item.naechste_wartung).toLocaleDateString("de-AT")}
                  </span>
                  {(isOverdue || isSoon) && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                </div>
              )}
              {item.wartungsintervall_monate && <div><span className="text-muted-foreground">Intervall:</span> {item.wartungsintervall_monate} Monate</div>}
            </div>
            {item.notizen && <p className="text-muted-foreground pt-2 border-t">{item.notizen}</p>}
          </CardContent>
        </Card>

        {/* Actions */}
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setTransferTyp(item.standort_typ === "lager" ? "baustelle" : "lager"); setShowTransfer(true); }}>
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Umlagern
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/equipment", { state: { editId: id } })}>
              <Pencil className="w-4 h-4 mr-1" /> Bearbeiten
            </Button>
            {(item.naechste_wartung || item.wartungsintervall_monate) && (
              <Button
                variant="outline"
                size="sm"
                className="text-green-700 border-green-400 hover:bg-green-50"
                onClick={() => {
                  const today = new Date().toISOString().split("T")[0];
                  setWartungDurchgefuehrtAm(today);
                  if (item.wartungsintervall_monate) {
                    const next = new Date();
                    next.setMonth(next.getMonth() + item.wartungsintervall_monate);
                    setNaechsteWartungNeu(next.toISOString().split("T")[0]);
                  } else {
                    setNaechsteWartungNeu("");
                  }
                  setShowWartung(true);
                }}
              >
                <CheckCircle className="w-4 h-4 mr-1" /> Wartung durchgeführt
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Löschen
            </Button>
          </div>
        )}

        {/* Transfer History */}
        {transfers.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Transfer-Historie</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Von</TableHead>
                    <TableHead>Nach</TableHead>
                    <TableHead>Von</TableHead>
                    <TableHead>Notizen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{format(new Date(t.transferiert_am), "dd.MM.yy HH:mm")}</TableCell>
                      <TableCell className="text-sm">{locationLabel(t.von_typ, t.von_project_id)}</TableCell>
                      <TableCell className="text-sm">{locationLabel(t.nach_typ, t.nach_project_id)}</TableCell>
                      <TableCell className="text-sm">{profiles[t.transferiert_von] || "–"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.notizen || "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Wartung Dialog */}
      <Dialog open={showWartung} onOpenChange={setShowWartung}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Wartung durchgeführt</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Wartung durchgeführt am</Label>
              <Input
                type="date"
                value={wartungDurchgefuehrtAm}
                onChange={(e) => setWartungDurchgefuehrtAm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Nächste Wartung</Label>
              <Input
                type="date"
                value={naechsteWartungNeu}
                onChange={(e) => setNaechsteWartungNeu(e.target.value)}
                className="mt-1"
              />
              {item?.wartungsintervall_monate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Automatisch berechnet: {item.wartungsintervall_monate} Monate ab heute
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWartung(false)}>Abbrechen</Button>
              <Button onClick={handleWartungDurchgefuehrt} disabled={savingWartung}>
                {savingWartung ? "Speichere..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gerät umlagern</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Neuer Standort</Label>
              <Select value={transferTyp} onValueChange={(v) => { setTransferTyp(v); if (v === "lager") setTransferProjectId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lager">Lager</SelectItem>
                  <SelectItem value="baustelle">Baustelle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {transferTyp === "baustelle" && (
              <div>
                <Label>Projekt</Label>
                <Select value={transferProjectId} onValueChange={setTransferProjectId}>
                  <SelectTrigger><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                  <SelectContent>
                    {projects.filter((p) => p.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Notizen</Label>
              <Textarea value={transferNotizen} onChange={(e) => setTransferNotizen(e.target.value)} rows={2} placeholder="Optional..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTransfer(false)}>Abbrechen</Button>
              <Button onClick={handleTransfer} disabled={transferring || (transferTyp === "baustelle" && !transferProjectId)}>
                {transferring ? "Wird umgelagert..." : "Umlagern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
