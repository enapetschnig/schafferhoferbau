import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Package, Trash2, ChevronDown, FileText, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

type Project = { id: string; name: string };
type Bestellung = {
  id: string;
  project_id: string | null;
  erstellt_von: string;
  typ: string;
  titel: string;
  beschreibung: string | null;
  status: string;
  lieferant: string | null;
  notizen: string | null;
  created_at: string;
};
type Position = { id: string; artikel: string; menge: number | null; einheit: string | null };

const STATUS_COLORS: Record<string, string> = {
  angefragt: "bg-yellow-100 text-yellow-800",
  teilweise_bestellt: "bg-blue-100 text-blue-800",
  bestellt: "bg-green-100 text-green-800",
  offen: "bg-yellow-100 text-yellow-800",
  nicht_vollstaendig: "bg-orange-100 text-orange-800",
  vollstaendig: "bg-green-100 text-green-800",
};
const STATUS_LABELS: Record<string, string> = {
  angefragt: "Angefragt",
  teilweise_bestellt: "Teilw. bestellt",
  bestellt: "Bestellt",
  offen: "Offen",
  nicht_vollstaendig: "Nicht vollstaendig",
  vollstaendig: "Vollstaendig",
};

export default function Bestellungen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    titel: "", beschreibung: "", projectId: "", lieferant: "", typ: "mitarbeiter",
  });
  const [formPositions, setFormPositions] = useState<{ artikel: string; menge: string; einheit: string }[]>([
    { artikel: "", menge: "", einheit: "Stk" },
  ]);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selectedOrder, setSelectedOrder] = useState<Bestellung | null>(null);
  const [orderPositions, setOrderPositions] = useState<Position[]>([]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    setIsAdmin(roleData?.role === "administrator");

    const [{ data: projData }, { data: profData }] = await Promise.all([
      supabase.from("projects").select("id, name").eq("status", "aktiv").order("name"),
      supabase.from("profiles").select("id, vorname, nachname"),
    ]);
    if (projData) setProjects(projData);
    if (profData) {
      const map: Record<string, string> = {};
      profData.forEach((p: any) => { map[p.id] = `${p.vorname} ${p.nachname}`; });
      setProfiles(map);
    }
    fetchBestellungen();
  };

  const fetchBestellungen = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bestellungen")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setBestellungen(data as Bestellung[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formData.titel.trim()) return;
    setSaving(true);

    const { data, error } = await supabase.from("bestellungen").insert({
      erstellt_von: userId,
      typ: isAdmin ? "chef" : "mitarbeiter",
      titel: formData.titel.trim(),
      beschreibung: formData.beschreibung.trim() || null,
      project_id: formData.projectId || null,
      lieferant: formData.lieferant.trim() || null,
      status: isAdmin ? "offen" : "angefragt",
    }).select().single();

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else if (data) {
      // Positionen speichern
      const validPositions = formPositions.filter(p => p.artikel.trim());
      if (validPositions.length > 0) {
        await supabase.from("bestellpositionen").insert(
          validPositions.map(p => ({
            bestellung_id: (data as Bestellung).id,
            artikel: p.artikel.trim(),
            menge: p.menge ? parseFloat(p.menge) : null,
            einheit: p.einheit || null,
          }))
        );
      }
      toast({ title: "Bestellung erstellt" });
      setShowForm(false);
      setFormData({ titel: "", beschreibung: "", projectId: "", lieferant: "", typ: "mitarbeiter" });
      setFormPositions([{ artikel: "", menge: "", einheit: "Stk" }]);
      fetchBestellungen();
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from("bestellungen").update({ status: newStatus }).eq("id", id);
    setBestellungen(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    if (selectedOrder?.id === id) setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
    toast({ title: `Status auf "${STATUS_LABELS[newStatus]}" geaendert` });
  };

  const openDetail = async (order: Bestellung) => {
    setSelectedOrder(order);
    const { data } = await supabase.from("bestellpositionen").select("*").eq("bestellung_id", order.id);
    setOrderPositions((data as Position[]) || []);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bestellung wirklich loeschen?")) return;
    await supabase.from("bestellungen").delete().eq("id", id);
    setBestellungen(prev => prev.filter(b => b.id !== id));
    setSelectedOrder(null);
    toast({ title: "Bestellung geloescht" });
  };

  const exportExcel = () => {
    const data = bestellungen.map(b => ({
      Titel: b.titel,
      Typ: b.typ === "chef" ? "Chef" : "Mitarbeiter",
      Status: STATUS_LABELS[b.status] || b.status,
      Lieferant: b.lieferant || "",
      Projekt: projects.find(p => p.id === b.project_id)?.name || "",
      Erstellt: new Date(b.created_at).toLocaleDateString("de-AT"),
      "Erstellt von": profiles[b.erstellt_von] || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bestellungen");
    XLSX.writeFile(wb, `Bestellungen_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const chefOrders = bestellungen.filter(b => b.typ === "chef");
  const maOrders = bestellungen.filter(b => b.typ === "mitarbeiter");

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Bestellungen" />
      <main className="container mx-auto px-4 py-6 max-w-5xl">

        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-muted-foreground">{bestellungen.length} Bestellungen</p>
          <div className="flex gap-2">
            {bestellungen.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportExcel}>
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> Neue Bestellung
            </Button>
          </div>
        </div>

        <Tabs defaultValue="alle">
          <TabsList className="mb-4">
            <TabsTrigger value="alle">Alle ({bestellungen.length})</TabsTrigger>
            <TabsTrigger value="chef">Chef ({chefOrders.length})</TabsTrigger>
            <TabsTrigger value="mitarbeiter">Mitarbeiter ({maOrders.length})</TabsTrigger>
          </TabsList>

          {["alle", "chef", "mitarbeiter"].map(tab => (
            <TabsContent key={tab} value={tab}>
              {loading ? <p className="text-center py-8 text-muted-foreground">Lade...</p> : (
                <div className="space-y-2">
                  {(tab === "alle" ? bestellungen : tab === "chef" ? chefOrders : maOrders).map(order => (
                    <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(order)}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Package className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{order.titel}</p>
                          <p className="text-xs text-muted-foreground">
                            {profiles[order.erstellt_von] || "?"} · {new Date(order.created_at).toLocaleDateString("de-AT")}
                            {order.lieferant && ` · ${order.lieferant}`}
                          </p>
                        </div>
                        <Badge className={STATUS_COLORS[order.status] || ""}>{STATUS_LABELS[order.status] || order.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                  {(tab === "alle" ? bestellungen : tab === "chef" ? chefOrders : maOrders).length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">Keine Bestellungen</p>
                  )}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>

      {/* Neue Bestellung Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neue Bestellung</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titel *</Label>
              <Input value={formData.titel} onChange={e => setFormData({ ...formData, titel: e.target.value })} placeholder="z.B. Zement 25kg" />
            </div>
            <div>
              <Label>Projekt</Label>
              <Select value={formData.projectId} onValueChange={v => setFormData({ ...formData, projectId: v })}>
                <SelectTrigger><SelectValue placeholder="Projekt waehlen (optional)" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lieferant</Label>
              <Input value={formData.lieferant} onChange={e => setFormData({ ...formData, lieferant: e.target.value })} placeholder="z.B. Lagerhaus, Baumit..." />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={formData.beschreibung} onChange={e => setFormData({ ...formData, beschreibung: e.target.value })} rows={2} />
            </div>

            {/* Positionen */}
            <div>
              <Label>Positionen</Label>
              <div className="space-y-2 mt-1">
                {formPositions.map((pos, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input className="flex-1" placeholder="Artikel" value={pos.artikel} onChange={e => {
                      const updated = [...formPositions];
                      updated[i].artikel = e.target.value;
                      setFormPositions(updated);
                    }} />
                    <Input className="w-20" type="number" placeholder="Menge" value={pos.menge} onChange={e => {
                      const updated = [...formPositions];
                      updated[i].menge = e.target.value;
                      setFormPositions(updated);
                    }} />
                    <Input className="w-16" placeholder="Einheit" value={pos.einheit} onChange={e => {
                      const updated = [...formPositions];
                      updated[i].einheit = e.target.value;
                      setFormPositions(updated);
                    }} />
                    {formPositions.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => setFormPositions(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setFormPositions(prev => [...prev, { artikel: "", menge: "", einheit: "Stk" }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Position
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={saving || !formData.titel.trim()}>
              {saving ? "Speichert..." : "Bestellung erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedOrder.titel}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className={STATUS_COLORS[selectedOrder.status]}>{STATUS_LABELS[selectedOrder.status]}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(selectedOrder.created_at).toLocaleDateString("de-AT")}</span>
                </div>

                {selectedOrder.beschreibung && <p className="text-sm">{selectedOrder.beschreibung}</p>}
                {selectedOrder.lieferant && <p className="text-sm"><strong>Lieferant:</strong> {selectedOrder.lieferant}</p>}
                <p className="text-sm"><strong>Erstellt von:</strong> {profiles[selectedOrder.erstellt_von] || "?"}</p>

                {orderPositions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Positionen:</p>
                    <div className="space-y-1">
                      {orderPositions.map(p => (
                        <div key={p.id} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                          <span>{p.artikel}</span>
                          <span className="text-muted-foreground">{p.menge} {p.einheit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status aendern */}
                {isAdmin && (
                  <div>
                    <Label className="text-xs">Status aendern</Label>
                    <Select value={selectedOrder.status} onValueChange={v => handleStatusChange(selectedOrder.id, v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {selectedOrder.typ === "chef" ? (
                          <>
                            <SelectItem value="offen">Offen</SelectItem>
                            <SelectItem value="nicht_vollstaendig">Nicht vollstaendig</SelectItem>
                            <SelectItem value="vollstaendig">Vollstaendig</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="angefragt">Angefragt</SelectItem>
                            <SelectItem value="teilweise_bestellt">Teilweise bestellt</SelectItem>
                            <SelectItem value="bestellt">Bestellt</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Nicht-Admin: MA kann Chef-Bestellung pruefen */}
                {!isAdmin && selectedOrder.typ === "chef" && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => handleStatusChange(selectedOrder.id, "nicht_vollstaendig")}>
                      Nicht vollstaendig
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(selectedOrder.id, "vollstaendig")}>
                      Vollstaendig
                    </Button>
                  </div>
                )}

                {isAdmin && (
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => handleDelete(selectedOrder.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Bestellung loeschen
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
