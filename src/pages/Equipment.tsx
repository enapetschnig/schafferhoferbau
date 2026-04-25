import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Wrench, Search, AlertTriangle, Camera, Receipt, X, Download, Upload, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { VoiceAIInput } from "@/components/VoiceAIInput";

type Project = { id: string; name: string };

type Equipment = {
  id: string;
  name: string;
  kategorie: string;
  seriennummer: string | null;
  kaufdatum: string | null;
  zustand: string;
  standort_typ: string;
  standort_project_id: string | null;
  notizen: string | null;
  naechste_wartung: string | null;
  wartungsintervall_monate: number | null;
  foto_url: string | null;
  rechnung_foto_url: string | null;
  created_at: string;
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

export default function EquipmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [items, setItems] = useState<Equipment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKategorie, setFilterKategorie] = useState("alle");
  const [filterStandort, setFilterStandort] = useState("alle");
  const [filterZustand, setFilterZustand] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", kategorie: "werkzeug", seriennummer: "", kaufdatum: "",
    zustand: "gut", standort_typ: "lager", standort_project_id: "",
    notizen: "", naechste_wartung: "", wartungsintervall_monate: "",
  });

  // AI Import state
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [aiImportLoading, setAiImportLoading] = useState(false);
  const [aiImportResult, setAiImportResult] = useState<{ equipment: any[]; uebersprungen: any[]; total_input: number } | null>(null);
  const [aiImportSelectedIdxs, setAiImportSelectedIdxs] = useState<Set<number>>(new Set());
  const [aiImportSaving, setAiImportSaving] = useState(false);

  // Photo state
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [rechnungFile, setRechnungFile] = useState<File | null>(null);
  const [rechnungPreview, setRechnungPreview] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const rechnungInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    const isAdmin = roleData?.role === "administrator";
    const { data: empData } = await supabase.from("employees").select("kategorie").eq("user_id", user.id).maybeSingle();
    setCanManage(isAdmin || ['vorarbeiter','facharbeiter'].includes(empData?.kategorie ?? ''));

    const { data } = await supabase.from("equipment").select("*").order("name");
    if (data) {
      setItems(data as any);
      // Auto-open edit dialog if navigated from detail page
      const editId = (location.state as any)?.editId;
      if (editId) {
        const target = (data as Equipment[]).find((i) => i.id === editId);
        if (target) openEdit(target);
        // Clear the state so refreshes don't re-open
        window.history.replaceState({}, "");
      }
    }

    const { data: proj } = await supabase.from("projects").select("id, name").eq("status", "aktiv").order("name");
    if (proj) setProjects(proj);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const resetForm = () => {
    setForm({ name: "", kategorie: "werkzeug", seriennummer: "", kaufdatum: "", zustand: "gut", standort_typ: "lager", standort_project_id: "", notizen: "", naechste_wartung: "", wartungsintervall_monate: "" });
    setEditingItem(null);
    setFotoFile(null);
    setFotoPreview(null);
    setRechnungFile(null);
    setRechnungPreview(null);
  };

  const openEdit = (item: Equipment) => {
    setEditingItem(item);
    setForm({
      name: item.name, kategorie: item.kategorie, seriennummer: item.seriennummer || "",
      kaufdatum: item.kaufdatum || "", zustand: item.zustand, standort_typ: item.standort_typ,
      standort_project_id: item.standort_project_id || "", notizen: item.notizen || "",
      naechste_wartung: item.naechste_wartung || "", wartungsintervall_monate: item.wartungsintervall_monate?.toString() || "",
    });
    setFotoFile(null);
    setFotoPreview(item.foto_url || null);
    setRechnungFile(null);
    setRechnungPreview(item.rechnung_foto_url || null);
    setShowForm(true);
  };

  const uploadPhoto = async (file: File, equipmentId: string, prefix: string): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${equipmentId}/${prefix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("equipment-photos").upload(path, file, { upsert: true });
    if (error) return null;
    const { data: urlData } = supabase.storage.from("equipment-photos").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.kategorie) {
      toast({ variant: "destructive", title: "Fehler", description: "Name und Kategorie sind erforderlich" });
      return;
    }
    setSaving(true);

    const payload: Record<string, any> = {
      name: form.name.trim(),
      kategorie: form.kategorie,
      seriennummer: form.seriennummer.trim() || null,
      kaufdatum: form.kaufdatum || null,
      zustand: form.zustand,
      standort_typ: form.standort_typ,
      standort_project_id: form.standort_typ === "baustelle" && form.standort_project_id ? form.standort_project_id : null,
      notizen: form.notizen.trim() || null,
      naechste_wartung: form.naechste_wartung || null,
      wartungsintervall_monate: form.wartungsintervall_monate ? parseInt(form.wartungsintervall_monate) : null,
    };

    let error;
    let equipmentId = editingItem?.id;

    if (editingItem) {
      ({ error } = await supabase.from("equipment").update(payload).eq("id", editingItem.id));
    } else {
      const { data, error: insertError } = await supabase.from("equipment").insert(payload).select("id").single();
      error = insertError;
      if (data) equipmentId = data.id;
    }

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      setSaving(false);
      return;
    }

    // Upload photos if selected
    if (equipmentId) {
      const photoUpdates: Record<string, string> = {};

      if (fotoFile) {
        const url = await uploadPhoto(fotoFile, equipmentId, "foto");
        if (url) photoUpdates.foto_url = url;
      } else if (!fotoPreview && editingItem?.foto_url) {
        // Photo was removed
        photoUpdates.foto_url = null as any;
      }

      if (rechnungFile) {
        const url = await uploadPhoto(rechnungFile, equipmentId, "rechnung");
        if (url) photoUpdates.rechnung_foto_url = url;
      } else if (!rechnungPreview && editingItem?.rechnung_foto_url) {
        photoUpdates.rechnung_foto_url = null as any;
      }

      if (Object.keys(photoUpdates).length > 0) {
        await supabase.from("equipment").update(photoUpdates).eq("id", equipmentId);
      }
    }

    toast({ title: "Gespeichert" });
    setShowForm(false);
    resetForm();
    fetchData();
    setSaving(false);
  };

  const isMaintenanceSoon = (date: string | null) => {
    if (!date) return false;
    const diff = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 14;
  };

  const isMaintenanceOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const filtered = items.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.seriennummer?.toLowerCase().includes(q);
    const matchKat = filterKategorie === "alle" || item.kategorie === filterKategorie;
    const matchStandort = filterStandort === "alle" || item.standort_typ === filterStandort;
    const matchZustand = filterZustand === "alle" || item.zustand === filterZustand;
    return matchSearch && matchKat && matchStandort && matchZustand;
  });

  const exportToExcel = () => {
    const data = filtered.map((item) => ({
      Name: item.name,
      Kategorie: KATEGORIE_LABELS[item.kategorie] || item.kategorie,
      Seriennummer: item.seriennummer || "",
      Kaufdatum: item.kaufdatum ? new Date(item.kaufdatum).toLocaleDateString("de-AT") : "",
      Zustand: ZUSTAND_LABELS[item.zustand] || item.zustand,
      Standort: item.standort_typ === "lager" ? "Lager" : projectMap[item.standort_project_id!] || "Baustelle",
      "Nächste Wartung": item.naechste_wartung ? new Date(item.naechste_wartung).toLocaleDateString("de-AT") : "",
      "Wartungsintervall (Monate)": item.wartungsintervall_monate || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 15 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Geräte");
    XLSX.writeFile(wb, `Geraete_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Leere Datei" });
      return;
    }

    // Kategorie-Reverse-Lookup
    const katReverse: Record<string, string> = {};
    Object.entries(KATEGORIE_LABELS).forEach(([k, v]) => { katReverse[v.toLowerCase()] = k; });
    const zustandReverse: Record<string, string> = {};
    Object.entries(ZUSTAND_LABELS).forEach(([k, v]) => { zustandReverse[v.toLowerCase()] = k; });

    let imported = 0;
    for (const row of rows) {
      const name = row["Name"] || row["name"] || "";
      if (!name) continue;

      const katLabel = (row["Kategorie"] || row["kategorie"] || "werkzeug").toString().toLowerCase();
      const zustandLabel = (row["Zustand"] || row["zustand"] || "gut").toString().toLowerCase();

      await supabase.from("equipment").insert({
        name: name.toString(),
        kategorie: katReverse[katLabel] || "werkzeug",
        seriennummer: (row["Seriennummer"] || row["seriennummer"] || null)?.toString() || null,
        kaufdatum: row["Kaufdatum"] || row["kaufdatum"] || null,
        zustand: zustandReverse[zustandLabel] || "gut",
        standort_typ: "lager",
        wartungsintervall_monate: parseInt(row["Wartungsintervall (Monate)"] || row["wartungsintervall"]) || null,
      });
      imported++;
    }

    toast({ title: `${imported} Geräte importiert` });
    fetchData();
    e.target.value = "";
  };

  const handleAIImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setAiImportOpen(true);
    setAiImportLoading(true);
    setAiImportResult(null);
    setAiImportSelectedIdxs(new Set());

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Rohe Zeilen mit Header-Erkennung
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null, raw: false });
      if (rows.length === 0) {
        toast({ variant: "destructive", title: "Leere Datei" });
        setAiImportLoading(false);
        setAiImportOpen(false);
        return;
      }

      const { data: result, error } = await supabase.functions.invoke("ai-import-equipment", {
        body: { rows },
      });

      if (error) throw error;
      if (!result?.equipment) throw new Error("KI-Antwort ungültig");

      setAiImportResult(result);
      setAiImportSelectedIdxs(new Set(result.equipment.map((_: any, i: number) => i)));
    } catch (err: any) {
      toast({ variant: "destructive", title: "KI-Import fehlgeschlagen", description: err.message });
      setAiImportOpen(false);
    } finally {
      setAiImportLoading(false);
    }
  };

  const toggleAiRow = (idx: number) => {
    const next = new Set(aiImportSelectedIdxs);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setAiImportSelectedIdxs(next);
  };

  const confirmAIImport = async () => {
    if (!aiImportResult || aiImportSelectedIdxs.size === 0) return;
    setAiImportSaving(true);
    const toInsert = aiImportResult.equipment
      .filter((_, i) => aiImportSelectedIdxs.has(i))
      .map(e => ({
        name: e.name,
        kategorie: e.kategorie,
        seriennummer: e.seriennummer,
        kaufdatum: e.kaufdatum,
        zustand: e.zustand,
        standort_typ: e.standort_typ,
        wartungsintervall_monate: e.wartungsintervall_monate,
        naechste_wartung: e.naechste_wartung,
        notizen: e.notizen,
      }));
    const { error } = await supabase.from("equipment").insert(toInsert);
    setAiImportSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: `${toInsert.length} Geräte importiert` });
    setAiImportOpen(false);
    setAiImportResult(null);
    fetchData();
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <PageHeader title="Geräteverwaltung" />

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">
          {items.length} Geräte gesamt
        </p>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportToExcel}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          )}
          {canManage && (
            <label className="cursor-pointer inline-flex">
              <input type="file" accept=".xlsx,.xls" onChange={handleAIImport} className="hidden" />
              <Button size="sm" variant="outline" type="button" onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }} title="KI erkennt Spalten automatisch">
                <Sparkles className="w-4 h-4 mr-1" /> KI-Import
              </Button>
            </label>
          )}
          {canManage && (
            <label className="cursor-pointer inline-flex">
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
              <Button size="sm" variant="outline" type="button" onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }} title="Standard-Import (feste Spaltennamen)">
                <Upload className="w-4 h-4 mr-1" /> Import
              </Button>
            </label>
          )}
          {canManage && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Neues Gerät
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Suchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
          </div>
        </div>
        <Select value={filterKategorie} onValueChange={setFilterKategorie}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Kategorien</SelectItem>
            {Object.entries(KATEGORIE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStandort} onValueChange={setFilterStandort}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Standorte</SelectItem>
            <SelectItem value="lager">Lager</SelectItem>
            <SelectItem value="baustelle">Baustelle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterZustand} onValueChange={setFilterZustand}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Zustände</SelectItem>
            {Object.entries(ZUSTAND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Lade...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Wrench className="w-12 h-12 mx-auto mb-4" />
            <p>Keine Geräte gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/equipment/${item.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {item.foto_url ? (
                    <img
                      src={item.foto_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-md object-cover shrink-0 border"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0 border">
                      <Wrench className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{item.name}</span>
                        <Badge variant="outline" className="text-xs">{KATEGORIE_LABELS[item.kategorie]}</Badge>
                        <Badge className={`text-xs ${ZUSTAND_COLORS[item.zustand] || ""}`}>
                          {ZUSTAND_LABELS[item.zustand]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.standort_typ === "lager" ? "Lager" : projectMap[item.standort_project_id!] || "Baustelle"}
                        {item.seriennummer && ` · SN: ${item.seriennummer}`}
                      </p>
                    </div>
                    {isMaintenanceSoon(item.naechste_wartung) && (
                      <Badge variant={isMaintenanceOverdue(item.naechste_wartung) ? "destructive" : "secondary"} className="shrink-0 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {isMaintenanceOverdue(item.naechste_wartung) ? "Überfällig" : "Wartung bald"}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); setShowForm(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Gerät bearbeiten" : "Neues Gerät"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Bohrmaschine Hilti" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kategorie *</Label>
                <Select value={form.kategorie} onValueChange={(v) => setForm({ ...form, kategorie: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KATEGORIE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zustand</Label>
                <Select value={form.zustand} onValueChange={(v) => setForm({ ...form, zustand: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ZUSTAND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Seriennummer</Label>
                <Input value={form.seriennummer} onChange={(e) => setForm({ ...form, seriennummer: e.target.value })} />
              </div>
              <div>
                <Label>Kaufdatum</Label>
                <Input type="date" value={form.kaufdatum} onChange={(e) => setForm({ ...form, kaufdatum: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Standort</Label>
                <Select value={form.standort_typ} onValueChange={(v) => setForm({ ...form, standort_typ: v, standort_project_id: v === "lager" ? "" : form.standort_project_id })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lager">Lager</SelectItem>
                    <SelectItem value="baustelle">Baustelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.standort_typ === "baustelle" && (
                <div>
                  <Label>Projekt</Label>
                  <Select value={form.standort_project_id} onValueChange={(v) => setForm({ ...form, standort_project_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nächste Wartung</Label>
                <Input type="date" value={form.naechste_wartung} onChange={(e) => setForm({ ...form, naechste_wartung: e.target.value })} />
              </div>
              <div>
                <Label>Wartungsintervall (Monate)</Label>
                <Input type="number" min="1" value={form.wartungsintervall_monate} onChange={(e) => setForm({ ...form, wartungsintervall_monate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notizen</Label>
              <VoiceAIInput
                multiline
                rows={2}
                context="notiz"
                value={form.notizen}
                onChange={(v) => setForm({ ...form, notizen: v })}
              />
            </div>
            {/* Photo uploads */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <Camera className="w-3.5 h-3.5" /> Gerätefoto
                </Label>
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFotoFile(file);
                      setFotoPreview(URL.createObjectURL(file));
                    }
                  }}
                />
                {fotoPreview ? (
                  <div className="relative">
                    <img src={fotoPreview} alt="Gerätefoto" className="w-full h-28 object-cover rounded-md border" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); setFotoFile(null); setFotoPreview(null); }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="w-full h-28 border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    <Camera className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Foto hochladen</span>
                  </div>
                )}
              </div>
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Rechnungsfoto
                </Label>
                <input
                  ref={rechnungInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setRechnungFile(file);
                      setRechnungPreview(URL.createObjectURL(file));
                    }
                  }}
                />
                {rechnungPreview ? (
                  <div className="relative">
                    <img src={rechnungPreview} alt="Rechnung" className="w-full h-28 object-cover rounded-md border" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); setRechnungFile(null); setRechnungPreview(null); }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="w-full h-28 border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => rechnungInputRef.current?.click()}
                  >
                    <Receipt className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Rechnung hochladen</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Speichert..." : editingItem ? "Aktualisieren" : "Speichern"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* KI-Import Preview Dialog */}
      <Dialog open={aiImportOpen} onOpenChange={(o) => { if (!o && !aiImportSaving) { setAiImportOpen(false); setAiImportResult(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> KI-Import: Vorschau
            </DialogTitle>
          </DialogHeader>

          {aiImportLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">KI analysiert die Excel-Datei und erkennt die Spalten...</p>
            </div>
          )}

          {!aiImportLoading && aiImportResult && (
            <>
              <div className="text-sm p-3 rounded-lg bg-muted/50 border mb-3">
                <p>
                  <strong>{aiImportResult.equipment.length}</strong> Geräte aus <strong>{aiImportResult.total_input}</strong> Zeilen erkannt
                  {aiImportResult.uebersprungen?.length > 0 && (
                    <span className="text-orange-600"> · {aiImportResult.uebersprungen.length} übersprungen</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Prüfe die Zuordnung und wähle aus, welche Geräte importiert werden sollen.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left w-8">
                        <input
                          type="checkbox"
                          checked={aiImportSelectedIdxs.size === aiImportResult.equipment.length && aiImportResult.equipment.length > 0}
                          onChange={() => {
                            if (aiImportSelectedIdxs.size === aiImportResult.equipment.length) {
                              setAiImportSelectedIdxs(new Set());
                            } else {
                              setAiImportSelectedIdxs(new Set(aiImportResult.equipment.map((_, i) => i)));
                            }
                          }}
                        />
                      </th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Kategorie</th>
                      <th className="p-2 text-left">Zustand</th>
                      <th className="p-2 text-left">S/N</th>
                      <th className="p-2 text-left">Kaufdatum</th>
                      <th className="p-2 text-left">Wartung (Mo.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiImportResult.equipment.map((e, idx) => (
                      <tr key={idx} className={`border-t ${aiImportSelectedIdxs.has(idx) ? "" : "opacity-40"}`}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={aiImportSelectedIdxs.has(idx)}
                            onChange={() => toggleAiRow(idx)}
                          />
                        </td>
                        <td className="p-2 font-medium">{e.name}</td>
                        <td className="p-2">{KATEGORIE_LABELS[e.kategorie] || e.kategorie}</td>
                        <td className="p-2">{ZUSTAND_LABELS[e.zustand] || e.zustand}</td>
                        <td className="p-2 text-muted-foreground">{e.seriennummer || "–"}</td>
                        <td className="p-2 text-muted-foreground">{e.kaufdatum || "–"}</td>
                        <td className="p-2 text-muted-foreground">{e.wartungsintervall_monate ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {aiImportResult.equipment.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-sm">Keine Geräte erkannt</p>
                )}
              </div>

              {aiImportResult.uebersprungen?.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-orange-600">
                    {aiImportResult.uebersprungen.length} Zeilen übersprungen anzeigen
                  </summary>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {aiImportResult.uebersprungen.map((s: any, i: number) => (
                      <li key={i}>• Zeile {s.zeile ?? "?"}: {s.grund}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="outline" onClick={() => { setAiImportOpen(false); setAiImportResult(null); }} disabled={aiImportSaving}>
                  Abbrechen
                </Button>
                <Button onClick={confirmAIImport} disabled={aiImportSaving || aiImportSelectedIdxs.size === 0}>
                  {aiImportSaving
                    ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importiert...</>
                    : <><CheckCircle2 className="w-4 h-4 mr-1" /> {aiImportSelectedIdxs.size} importieren</>}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
