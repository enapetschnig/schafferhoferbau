import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, CloudRain, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { WeatherSelector } from "@/components/WeatherSelector";
import { VoiceAIInput } from "@/components/VoiceAIInput";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Project = { id: string; name: string; plz: string | null };

type BadWeatherRecord = {
  id: string;
  user_id: string;
  project_id: string;
  datum: string;
  beginn_schlechtwetter: string;
  ende_schlechtwetter: string;
  schlechtwetter_stunden: number;
  arbeitsstunden_vor_schlechtwetter: number;
  wetter_art: string[];
  notizen: string | null;
  created_at: string;
  projects?: { name: string; plz: string | null } | null;
};

const WETTER_LABELS: Record<string, string> = {
  regen: "Regen",
  schnee: "Schnee",
  frost: "Frost",
  sturm: "Sturm",
  hagel: "Hagel",
  gewitter: "Gewitter",
};

export default function BadWeather() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [records, setRecords] = useState<BadWeatherRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BadWeatherRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    projectId: "",
    datum: format(new Date(), "yyyy-MM-dd"),
    beginn: "08:00",
    ende: "16:00",
    arbeitsstundenVorher: "",
    notizen: "",
  });
  const [wetterArt, setWetterArt] = useState<string[]>([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("bad_weather_records")
      .select("*, projects(name, plz)")
      .order("datum", { ascending: false });

    if (data) setRecords(data as any);
    setLoading(false);
  }, []);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, plz")
      .eq("status", "aktiv")
      .order("name");
    if (data) setProjects(data);
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchProjects();
  }, [fetchRecords, fetchProjects]);

  const calculateHours = (beginn: string, ende: string): number => {
    const [bh, bm] = beginn.split(":").map(Number);
    const [eh, em] = ende.split(":").map(Number);
    const diff = (eh * 60 + em - bh * 60 - bm) / 60;
    return Math.max(0, Math.round(diff * 100) / 100);
  };

  const resetForm = () => {
    setFormData({
      projectId: "",
      datum: format(new Date(), "yyyy-MM-dd"),
      beginn: "08:00",
      ende: "16:00",
      arbeitsstundenVorher: "",
      notizen: "",
    });
    setWetterArt([]);
    setEditingRecord(null);
  };

  const openEdit = (record: BadWeatherRecord) => {
    setEditingRecord(record);
    setFormData({
      projectId: record.project_id,
      datum: record.datum,
      beginn: record.beginn_schlechtwetter.slice(0, 5),
      ende: record.ende_schlechtwetter.slice(0, 5),
      arbeitsstundenVorher: record.arbeitsstunden_vor_schlechtwetter?.toString() || "",
      notizen: record.notizen || "",
    });
    setWetterArt(record.wetter_art || []);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.projectId || !formData.datum || !formData.beginn || !formData.ende) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte alle Pflichtfelder ausfüllen" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const stunden = calculateHours(formData.beginn, formData.ende);

    const payload = {
      user_id: user.id,
      project_id: formData.projectId,
      datum: formData.datum,
      beginn_schlechtwetter: formData.beginn,
      ende_schlechtwetter: formData.ende,
      schlechtwetter_stunden: stunden,
      arbeitsstunden_vor_schlechtwetter: parseFloat(formData.arbeitsstundenVorher) || 0,
      wetter_art: wetterArt,
      notizen: formData.notizen.trim() || null,
    };

    let error;
    if (editingRecord) {
      ({ error } = await supabase.from("bad_weather_records").update(payload).eq("id", editingRecord.id));
    } else {
      ({ error } = await supabase.from("bad_weather_records").insert(payload));
    }

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert", description: editingRecord ? "Eintrag aktualisiert" : "Schlechtwetter-Eintrag erstellt" });
      setShowForm(false);
      resetForm();
      fetchRecords();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("bad_weather_records").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht" });
      fetchRecords();
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <PageHeader title="Schlechtwetterdokumentation" />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">
          Dokumentation von Schlechtwettertagen gemäß BauKG
        </p>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Neuer Eintrag
        </Button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Lade...</p>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <CloudRain className="w-12 h-12 mb-4" />
            <p>Keine Schlechtwetter-Einträge vorhanden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <Card key={record.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {format(new Date(record.datum), "EEEE, dd.MM.yyyy", { locale: de })}
                      </span>
                      <Badge variant="secondary">
                        {record.schlechtwetter_stunden}h Schlechtwetter
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(record.projects as any)?.name || "Unbekanntes Projekt"}
                      {" — "}
                      {record.beginn_schlechtwetter?.slice(0, 5)} bis {record.ende_schlechtwetter?.slice(0, 5)}
                    </p>
                    {record.arbeitsstunden_vor_schlechtwetter > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {record.arbeitsstunden_vor_schlechtwetter}h Arbeit vor Schlechtwetter
                      </p>
                    )}
                    {record.wetter_art && record.wetter_art.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {record.wetter_art.map((w) => (
                          <Badge key={w} variant="outline" className="text-xs">
                            {WETTER_LABELS[w] || w}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {record.notizen && (
                      <p className="text-xs text-muted-foreground mt-1">{record.notizen}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(record)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(record.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); setShowForm(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Eintrag bearbeiten" : "Schlechtwetter dokumentieren"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Projekt *</Label>
              <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v })}>
                <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} {p.plz ? `(${p.plz})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Datum *</Label>
              <Input
                type="date"
                value={formData.datum}
                onChange={(e) => setFormData({ ...formData, datum: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Beginn Schlechtwetter *</Label>
                <Input
                  type="time"
                  step={900}
                  value={formData.beginn}
                  onChange={(e) => setFormData({ ...formData, beginn: e.target.value })}
                />
              </div>
              <div>
                <Label>Ende Schlechtwetter *</Label>
                <Input
                  type="time"
                  step={900}
                  value={formData.ende}
                  onChange={(e) => setFormData({ ...formData, ende: e.target.value })}
                />
              </div>
            </div>

            {formData.beginn && formData.ende && (
              <p className="text-sm text-muted-foreground">
                Schlechtwetter-Stunden: <strong>{calculateHours(formData.beginn, formData.ende)}h</strong>
              </p>
            )}

            <div>
              <Label>Arbeitsstunden vor Schlechtwetter</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={formData.arbeitsstundenVorher}
                onChange={(e) => setFormData({ ...formData, arbeitsstundenVorher: e.target.value })}
                placeholder="z.B. 2.5"
              />
            </div>

            <WeatherSelector
              value={wetterArt}
              onChange={setWetterArt}
              label="Art des Schlechtwetters"
            />

            <div>
              <Label>Notizen</Label>
              <VoiceAIInput
                multiline
                rows={3}
                context="notiz"
                value={formData.notizen}
                onChange={(v) => setFormData({ ...formData, notizen: v })}
                placeholder="Zusätzliche Informationen..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Speichere..." : editingRecord ? "Aktualisieren" : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
