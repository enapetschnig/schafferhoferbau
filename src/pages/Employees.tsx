import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/time-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, User, FileText, Clock, Mail, Phone, MapPin, FileSpreadsheet, Shirt } from "lucide-react";
import { format } from "date-fns";
import EmployeeDocumentsManager from "@/components/EmployeeDocumentsManager";
import { DEFAULT_SCHEDULE, LEHRLING_SCHEDULE, DEFAULT_SCHWELLENWERT, type WeekSchedule, type Schwellenwert } from "@/lib/workingHours";

interface Employee {
  id: string;
  user_id: string | null;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  sv_nummer: string | null;
  eintritt_datum: string | null;
  austritt_datum: string | null;
  position: string | null;
  beschaeftigung_art: string | null;
  stundenlohn: number | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  kleidungsgroesse: string | null;
  schuhgroesse: string | null;
  notizen: string | null;
  kategorie: string | null;
  regelarbeitszeit: any | null;
  wochen_soll_stunden: number | null;
  schwellenwert: any | null;
  is_external: boolean | null;
}

const KATEGORIE_LABELS: Record<string, string> = {
  lehrling: "Lehrling",
  facharbeiter: "Facharbeiter",
  vorarbeiter: "Vorarbeiter",
  extern: "Extern",
  bauherr: "Bauherr",
};

// Kategorien, die ueber external_employee_projects pro Baustelle freigegeben
// werden muessen (statt ueber die Plantafel). Bauherren werden wie externe
// Mitarbeiter behandelt.
const EXTERNAL_LIKE_KATEGORIEN = ["extern", "bauherr"];
const isExternalLikeKategorie = (k: string | null | undefined) =>
  !!k && EXTERNAL_LIKE_KATEGORIEN.includes(k);

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
type DayKey = "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
const DAY_KEYS: DayKey[] = ["mo", "di", "mi", "do", "fr", "sa", "so"];

export default function Employees() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Employee>>({});
  const [newEmployee, setNewEmployee] = useState({ vorname: "", nachname: "", email: "", kategorie: "facharbeiter" });
  const [showSizesDialog, setShowSizesDialog] = useState(false);
  const [profileActiveMap, setProfileActiveMap] = useState<Record<string, boolean>>({});
  // Baustellen-Freigabe fuer externe Mitarbeiter
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; plz: string | null }[]>([]);
  const [externalProjectIds, setExternalProjectIds] = useState<string[]>([]);

  useEffect(() => {
    checkAdminAccess();
    fetchEmployees();
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, plz")
        .in("status", ["aktiv", "in_planung"])
        .order("name");
      setAllProjects(data || []);
    })();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (data?.role !== "administrator") {
      toast({ title: "Keine Berechtigung", description: "Nur Administratoren können auf diese Seite zugreifen", variant: "destructive" });
      navigate("/");
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("nachname");

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setEmployees(data || []);
      // Fetch profile activation status for employees with user_id
      const userIds = (data || []).filter(e => e.user_id).map(e => e.user_id!);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, is_active")
          .in("id", userIds);
        const map: Record<string, boolean> = {};
        (profiles || []).forEach(p => { map[p.id] = p.is_active !== false; });
        setProfileActiveMap(map);
      }
    }
    setLoading(false);
  };

  const [attachingAccount, setAttachingAccount] = useState(false);

  // App-Account fuer bestehenden MA ohne user_id anlegen (Edge Function,
  // attach-Modus). Danach ist der MA in Lohnzettel-Zuordnung, Plantafel,
  // Team-Zeiterfassung etc. verfuegbar.
  const handleAttachAccount = async (employee: Employee) => {
    if (employee.user_id) return;
    setAttachingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-employee-account", {
        body: {
          mode: "attach",
          employeeId: employee.id,
          email: employee.email || undefined,
        },
      });
      if (error) throw error;
      const resp = data as { success?: boolean; error?: string; userId?: string } | null;
      if (!resp?.success) throw new Error(resp?.error || "Account-Anlage fehlgeschlagen");
      toast({
        title: "App-Account angelegt",
        description: `${employee.vorname} ${employee.nachname} ist jetzt zuweisbar (Lohnzettel, Plantafel, Zeiterfassung).`,
      });
      setSelectedEmployee((prev) => prev ? { ...prev, user_id: resp.userId || null } : prev);
      fetchEmployees();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err?.message || "Account-Anlage fehlgeschlagen" });
    } finally {
      setAttachingAccount(false);
    }
  };

  const handleToggleActive = async (employee: Employee) => {
    if (!employee.user_id) return;
    const currentActive = profileActiveMap[employee.user_id] !== false;
    const newActive = !currentActive;

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: newActive })
      .eq("id", employee.user_id);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }

    setProfileActiveMap(prev => ({ ...prev, [employee.user_id!]: newActive }));
    toast({
      title: newActive ? "Mitarbeiter aktiviert" : "Mitarbeiter gesperrt",
      description: `${employee.vorname} ${employee.nachname} wurde ${newActive ? "aktiviert" : "gesperrt"}.`
    });
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Bauherren werden technisch wie Externe behandelt (keine eigene
      // Arbeitszeit-Regel, Freigabe per Baustelle).
      const isExtern = isExternalLikeKategorie(newEmployee.kategorie);
      const { data, error } = await supabase
        .from("employees")
        .insert({
          vorname: newEmployee.vorname,
          nachname: newEmployee.nachname,
          email: newEmployee.email || null,
          kategorie: newEmployee.kategorie,
          is_external: isExtern,
          regelarbeitszeit: isExtern ? null : (newEmployee.kategorie === "lehrling" ? LEHRLING_SCHEDULE : DEFAULT_SCHEDULE),
          wochen_soll_stunden: isExtern ? null : 39,
          schwellenwert: isExtern ? null : (DEFAULT_SCHWELLENWERT as any),
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Erfolg", description: "Mitarbeiter wurde angelegt" });
      setShowCreateDialog(false);
      setNewEmployee({ vorname: "", nachname: "", email: "", kategorie: "facharbeiter" });
      fetchEmployees();
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      const { error } = await supabase
        .from("employees")
        .update(formData)
        .eq("id", selectedEmployee.id);

      if (error) throw error;

      // Baustellen-Freigaben fuer externe Mitarbeiter und Bauherren synchronisieren
      if (isExternalLikeKategorie(formData.kategorie) && selectedEmployee.user_id) {
        const { data: { user } } = await supabase.auth.getUser();
        // bestehende Freigaben loeschen, gewaehlte neu anlegen
        await supabase
          .from("external_employee_projects")
          .delete()
          .eq("employee_user_id", selectedEmployee.user_id);
        if (externalProjectIds.length > 0) {
          const rows = externalProjectIds.map((pid) => ({
            employee_user_id: selectedEmployee.user_id!,
            project_id: pid,
            created_by: user?.id ?? null,
          }));
          const { error: eepErr } = await supabase.from("external_employee_projects").insert(rows);
          if (eepErr) throw eepErr;
        }
      }

      toast({ title: "Erfolg", description: "Änderungen gespeichert" });
      fetchEmployees();
      setSelectedEmployee(null);
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      setFormData(selectedEmployee);
      // Baustellen-Freigaben des externen Mitarbeiters laden
      setExternalProjectIds([]);
      if (isExternalLikeKategorie(selectedEmployee.kategorie) && selectedEmployee.user_id) {
        (async () => {
          const { data } = await supabase
            .from("external_employee_projects")
            .select("project_id")
            .eq("employee_user_id", selectedEmployee.user_id!);
          setExternalProjectIds((data || []).map((r: any) => r.project_id));
        })();
      }
    }
  }, [selectedEmployee]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Lade Mitarbeiter...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-3xl font-bold">Mitarbeiterverwaltung</h1>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSizesDialog(true)}>
            <Shirt className="w-4 h-4 mr-2" />
            Arbeitskleidung/Schuhe Größen
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Neuer Mitarbeiter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((emp) => (
          <Card
            key={emp.id}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setSelectedEmployee(emp)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Avatar>
                  <AvatarFallback>
                    {emp.vorname[0]}
                    {emp.nachname[0]}
                  </AvatarFallback>
                </Avatar>
                {emp.vorname} {emp.nachname}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 flex-wrap">
                {emp.position || "Mitarbeiter"}
                {emp.kategorie && (
                  <Badge variant={isExternalLikeKategorie(emp.kategorie) ? "outline" : "secondary"} className="text-xs">
                    {KATEGORIE_LABELS[emp.kategorie] || emp.kategorie}
                  </Badge>
                )}
                {emp.user_id && profileActiveMap[emp.user_id] === false && (
                  <Badge variant="destructive" className="text-xs">Gesperrt</Badge>
                )}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  {emp.email || "Keine E-Mail"}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {emp.telefon || "Keine Telefonnummer"}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {emp.plz} {emp.ort || "Kein Ort"}
                </div>
                {emp.eintritt_datum && (
                  <div className="text-muted-foreground mt-2">
                    Seit: {format(new Date(emp.eintritt_datum), "dd.MM.yyyy")}
                  </div>
                )}
                {!isExternalLikeKategorie(emp.kategorie) && (() => {
                  const sched = emp.regelarbeitszeit as WeekSchedule | null;
                  const sw = emp.schwellenwert as Schwellenwert | null;
                  const wd: Array<keyof WeekSchedule> = ["mo", "di", "mi", "do", "fr"];
                  const sollMoFr = sched
                    ? wd.map((k) => (sched[k] as any)?.hours ?? 0).filter((h: number) => h > 0)
                    : [];
                  const sollText = sollMoFr.length > 0
                    ? (sollMoFr.every((h: number) => h === sollMoFr[0]) ? `${sollMoFr[0]}h` : `${Math.min(...sollMoFr)}–${Math.max(...sollMoFr)}h`)
                    : "—";
                  const swMoFr = sw ? wd.map((k) => sw[k as keyof Schwellenwert] as number).filter((h) => h > 0) : [];
                  const swText = swMoFr.length > 0
                    ? (swMoFr.every((h) => h === swMoFr[0]) ? `${swMoFr[0]}h` : `${Math.min(...swMoFr)}–${Math.max(...swMoFr)}h`)
                    : sw ? "0h" : "Standard";
                  return (
                    <div className="text-xs text-muted-foreground mt-1">
                      Soll Mo–Fr: <strong>{sollText}</strong> · Schwellenwert: <strong>{swText}</strong>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail-Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {selectedEmployee?.vorname} {selectedEmployee?.nachname}
              </DialogTitle>
              {selectedEmployee?.user_id ? (
                <Button
                  variant={profileActiveMap[selectedEmployee.user_id] === false ? "default" : "destructive"}
                  size="sm"
                  onClick={() => handleToggleActive(selectedEmployee)}
                >
                  {profileActiveMap[selectedEmployee.user_id] === false ? "Aktivieren" : "Sperren"}
                </Button>
              ) : selectedEmployee ? (
                /* MA ohne App-Account: Account nachtraeglich anlegen — noetig
                   z.B. fuer Lohnzettel-Zuordnung und Team-Zeiterfassung. */
                <Button
                  variant="default"
                  size="sm"
                  disabled={attachingAccount}
                  onClick={() => handleAttachAccount(selectedEmployee)}
                >
                  {attachingAccount ? "Legt an..." : "App-Account anlegen"}
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          <Tabs defaultValue="stammdaten">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stammdaten">
                <User className="w-4 h-4 mr-2" />
                Stammdaten
              </TabsTrigger>
              <TabsTrigger value="dokumente">
                <FileText className="w-4 h-4 mr-2" />
                Dokumente
              </TabsTrigger>
              <TabsTrigger value="stunden">
                <Clock className="w-4 h-4 mr-2" />
                Überstunden
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Stammdaten */}
            <TabsContent value="stammdaten">
              <ScrollArea className="h-[500px] pr-4">
                <form onSubmit={handleSaveEmployee} className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Persönliche Daten</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Vorname *</Label>
                        <Input
                          value={formData.vorname || ""}
                          onChange={(e) => setFormData({ ...formData, vorname: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label>Nachname *</Label>
                        <Input
                          value={formData.nachname || ""}
                          onChange={(e) => setFormData({ ...formData, nachname: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label>Geburtsdatum</Label>
                        <Input
                          type="date"
                          value={formData.geburtsdatum || ""}
                          onChange={(e) => setFormData({ ...formData, geburtsdatum: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Kontaktdaten</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Adresse</Label>
                        <Input
                          value={formData.adresse || ""}
                          onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                          placeholder="Straße und Hausnummer"
                        />
                      </div>
                      <div>
                        <Label>PLZ</Label>
                        <Input
                          value={formData.plz || ""}
                          onChange={(e) => setFormData({ ...formData, plz: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Ort</Label>
                        <Input
                          value={formData.ort || ""}
                          onChange={(e) => setFormData({ ...formData, ort: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Telefon</Label>
                        <Input
                          type="tel"
                          value={formData.telefon || ""}
                          onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>E-Mail</Label>
                        <Input
                          type="email"
                          value={formData.email || ""}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Beschäftigung</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {!isExternalLikeKategorie(formData.kategorie) && (
                        <div>
                          <Label>SV-Nummer</Label>
                          <Input
                            value={formData.sv_nummer || ""}
                            onChange={(e) => setFormData({ ...formData, sv_nummer: e.target.value })}
                            placeholder="1234 010180"
                          />
                        </div>
                      )}
                      <div>
                        <Label>Position</Label>
                        <Input
                          value={formData.position || ""}
                          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                          placeholder={formData.kategorie === "bauherr" ? "z.B. Bauherr" : isExternalLikeKategorie(formData.kategorie) ? "z.B. Subunternehmer" : "z.B. Zimmermann"}
                        />
                      </div>
                      {!isExternalLikeKategorie(formData.kategorie) && (
                        <>
                          <div>
                            <Label>Eintrittsdatum</Label>
                            <Input
                              type="date"
                              value={formData.eintritt_datum || ""}
                              onChange={(e) => setFormData({ ...formData, eintritt_datum: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Austrittsdatum</Label>
                            <Input
                              type="date"
                              value={formData.austritt_datum || ""}
                              onChange={(e) => setFormData({ ...formData, austritt_datum: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Beschäftigungsart</Label>
                            <Select
                              value={formData.beschaeftigung_art || ""}
                              onValueChange={(v) => setFormData({ ...formData, beschaeftigung_art: v })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Wählen..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vollzeit">Vollzeit</SelectItem>
                                <SelectItem value="teilzeit">Teilzeit</SelectItem>
                                <SelectItem value="geringfuegig">Geringfügig</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                      <div>
                        <Label>Kategorie</Label>
                        <Select
                          value={formData.kategorie || "facharbeiter"}
                          onValueChange={(v) => {
                            // Bauherren werden technisch wie Externe behandelt
                            // (kein Arbeitszeit-Plan, kein wochen_soll_stunden),
                            // darum is_external = true bei v === "bauherr".
                            const externLike = EXTERNAL_LIKE_KATEGORIEN.includes(v);
                            const updates: Partial<Employee> = { kategorie: v, is_external: externLike };
                            if (v === "lehrling") {
                              updates.regelarbeitszeit = LEHRLING_SCHEDULE;
                              updates.wochen_soll_stunden = 39;
                            } else if (v === "facharbeiter" || v === "vorarbeiter") {
                              updates.regelarbeitszeit = DEFAULT_SCHEDULE;
                              updates.wochen_soll_stunden = 39;
                            } else if (externLike) {
                              updates.regelarbeitszeit = null;
                              updates.wochen_soll_stunden = null;
                            }
                            setFormData({ ...formData, ...updates });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lehrling">Lehrling</SelectItem>
                            <SelectItem value="facharbeiter">Facharbeiter</SelectItem>
                            <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                            <SelectItem value="extern">Extern</SelectItem>
                            <SelectItem value="bauherr">Bauherr</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Stundenlohn (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.stundenlohn || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, stundenlohn: parseFloat(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Freigegebene Baustellen — fuer Externe und Bauherren */}
                  {isExternalLikeKategorie(formData.kategorie) && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold mb-1">Freigegebene Baustellen</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          {formData.kategorie === "bauherr"
                            ? "Baustellen, auf denen ein Vorarbeiter Stunden für diesen Bauherrn eintragen darf (z.B. Eigenleistung)."
                            : "Baustellen, auf denen ein Vorarbeiter Stunden für diesen externen Mitarbeiter eintragen darf."}
                        </p>
                        {!selectedEmployee?.user_id ? (
                          <p className="text-sm text-muted-foreground rounded-md border p-3 bg-muted/30">
                            Dieser Mitarbeiter hat keinen App-Zugang — eine Baustellen-Freigabe
                            ist daher nicht möglich.
                          </p>
                        ) : allProjects.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Keine aktiven Projekte vorhanden.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56 overflow-y-auto rounded-md border p-2">
                            {allProjects.map((p) => {
                              const checked = externalProjectIds.includes(p.id);
                              return (
                                <label key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      setExternalProjectIds((prev) =>
                                        v ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                                      );
                                    }}
                                  />
                                  <span className="text-sm">{p.name}{p.plz ? ` (${p.plz})` : ""}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* Regelarbeitszeit (mit optionaler 14-taegiger Durchrechnung) */}
                  {!isExternalLikeKategorie(formData.kategorie) && (() => {
                    const schedule = (formData.regelarbeitszeit as WeekSchedule) || DEFAULT_SCHEDULE;
                    const isBiweekly = schedule.zyklus === "biweekly";
                    const ankerDefault = (() => {
                      // Default-Anker: aktueller Montag
                      const d = new Date();
                      const day = d.getDay();
                      const diff = (day + 6) % 7; // Mo=0
                      d.setDate(d.getDate() - diff);
                      return d.toISOString().split("T")[0];
                    })();

                    const renderWeekGrid = (variant: "A" | "B") => {
                      const weekData = variant === "A"
                        ? schedule
                        : (schedule.woche_b as any) || ({} as any);
                      return (
                        <div className="grid grid-cols-7 gap-2">
                          {DAY_KEYS.map((key, idx) => {
                            const day = weekData[key] || { start: null, end: null, pause: 0, hours: 0 };
                            const updateDay = (field: "start" | "end" | "hours" | "pause" | "pause_start" | "pause_end", val: any) => {
                              const newSchedule: any = { ...schedule };
                              if (variant === "A") {
                                newSchedule[key] = { ...day, [field]: val };
                              } else {
                                newSchedule.woche_b = { ...(schedule.woche_b || {}), [key]: { ...day, [field]: val } };
                              }
                              // Wochensoll bei A neu berechnen (B beeinflusst eigene Periode)
                              if (variant === "A" && field === "hours") {
                                const total = DAY_KEYS.reduce((s, k) => s + ((newSchedule[k] as any)?.hours ?? 0), 0);
                                setFormData({ ...formData, regelarbeitszeit: newSchedule, wochen_soll_stunden: total });
                              } else {
                                setFormData({ ...formData, regelarbeitszeit: newSchedule });
                              }
                            };
                            return (
                              <div key={key} className="space-y-1 text-center">
                                <Label className="text-xs font-bold">{DAY_LABELS[idx]}</Label>
                                <TimeInput
                                  value={day.start || ""}
                                  onChange={(v) => updateDay("start", v || null)}
                                  className="h-8 text-xs px-1"
                                  placeholder="--:--"
                                />
                                <TimeInput
                                  value={day.end || ""}
                                  onChange={(v) => updateDay("end", v || null)}
                                  className="h-8 text-xs px-1"
                                  placeholder="--:--"
                                />
                                <Input
                                  type="number" min="0" max="24" step="0.25"
                                  value={day.hours ?? 0}
                                  onChange={(e) => updateDay("hours", parseFloat(e.target.value) || 0)}
                                  className="h-8 text-xs px-1"
                                  placeholder="h"
                                />
                                <TimeInput
                                  value={day.pause_start || ""}
                                  onChange={(v) => {
                                    const val = v || null;
                                    updateDay("pause_start", val);
                                    // pause_minutes automatisch nachfuehren wenn beide Zeiten gesetzt sind
                                    if (val && day.pause_end) {
                                      const [sh, sm] = val.split(":").map(Number);
                                      const [eh, em] = day.pause_end.split(":").map(Number);
                                      const min = (eh * 60 + em) - (sh * 60 + sm);
                                      if (min > 0) updateDay("pause", min);
                                    }
                                  }}
                                  className="h-8 text-xs px-1"
                                  placeholder="P-Start"
                                  title="Pausen-Beginn"
                                />
                                <TimeInput
                                  value={day.pause_end || ""}
                                  onChange={(v) => {
                                    const val = v || null;
                                    updateDay("pause_end", val);
                                    if (day.pause_start && val) {
                                      const [sh, sm] = day.pause_start.split(":").map(Number);
                                      const [eh, em] = val.split(":").map(Number);
                                      const min = (eh * 60 + em) - (sh * 60 + sm);
                                      if (min > 0) updateDay("pause", min);
                                    }
                                  }}
                                  className="h-8 text-xs px-1"
                                  placeholder="P-Ende"
                                  title="Pausen-Ende"
                                />
                                <Input
                                  type="number" min="0" max="120" step="5"
                                  value={day.pause || 0}
                                  onChange={(e) => updateDay("pause", parseInt(e.target.value) || 0)}
                                  className="h-8 text-xs px-1"
                                  placeholder="min"
                                  title="Pausen-Minuten (auto bei Start+Ende)"
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    };

                    return (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Regelarbeitszeit</h3>
                        <div className="flex items-center gap-3 mb-3">
                          <Label className="text-sm whitespace-nowrap">Wochenstunden-Soll:</Label>
                          <Input
                            type="number" min="0" max="60" step="0.5"
                            value={formData.wochen_soll_stunden ?? 39}
                            onChange={(e) => setFormData({ ...formData, wochen_soll_stunden: parseFloat(e.target.value) || 0 })}
                            className="h-9 w-24"
                          />
                          <span className="text-sm text-muted-foreground">h/Woche</span>
                        </div>

                        <label className="flex items-center gap-2 mb-3 p-2 rounded-md border cursor-pointer hover:bg-muted/30">
                          <Checkbox
                            checked={isBiweekly}
                            onCheckedChange={(v) => {
                              const checked = !!v;
                              const newSchedule: any = { ...schedule };
                              if (checked) {
                                newSchedule.zyklus = "biweekly";
                                if (!newSchedule.woche_b) {
                                  // Default Woche B: Kopie der Woche A
                                  newSchedule.woche_b = DAY_KEYS.reduce((acc, k) => {
                                    acc[k] = { ...(schedule as any)[k] };
                                    return acc;
                                  }, {} as any);
                                }
                                if (!newSchedule.zyklus_anker) {
                                  newSchedule.zyklus_anker = ankerDefault;
                                }
                              } else {
                                newSchedule.zyklus = "weekly";
                                delete newSchedule.woche_b;
                                delete newSchedule.zyklus_anker;
                              }
                              setFormData({ ...formData, regelarbeitszeit: newSchedule });
                            }}
                          />
                          <span className="text-sm">14-tägige Durchrechnung (kurze / lange Woche im Wechsel)</span>
                        </label>

                        {isBiweekly && (
                          <div className="mb-3 flex items-center gap-3">
                            <Label className="text-sm whitespace-nowrap">Anker (Mo der ersten Kurze-Woche-Periode):</Label>
                            <Input
                              type="date"
                              value={schedule.zyklus_anker || ankerDefault}
                              onChange={(e) => {
                                setFormData({ ...formData, regelarbeitszeit: { ...schedule, zyklus_anker: e.target.value } as any });
                              }}
                              className="h-9 w-44"
                            />
                          </div>
                        )}

                        {isBiweekly ? (
                          <Tabs defaultValue="A" className="w-full">
                            <TabsList>
                              <TabsTrigger value="A">Kurze Woche (A)</TabsTrigger>
                              <TabsTrigger value="B">Lange Woche (B)</TabsTrigger>
                            </TabsList>
                            <TabsContent value="A" className="pt-3">{renderWeekGrid("A")}</TabsContent>
                            <TabsContent value="B" className="pt-3">{renderWeekGrid("B")}</TabsContent>
                          </Tabs>
                        ) : (
                          renderWeekGrid("A")
                        )}

                        <p className="text-xs text-muted-foreground mt-2">
                          Pro Tag von oben nach unten: Beginn / Ende / Stunden / Pause-Beginn / Pause-Ende / Pause-Minuten. Pause-Minuten werden automatisch berechnet, wenn Start und Ende gesetzt sind.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Schwellenwerte (Lohnstunden-Obergrenze pro Tag) */}
                  {!isExternalLikeKategorie(formData.kategorie) && (() => {
                    const sw = (formData.schwellenwert as Schwellenwert) || DEFAULT_SCHWELLENWERT;
                    const isBiweekly = sw.zyklus === "biweekly";
                    const ankerDefault = (() => {
                      const d = new Date();
                      const day = d.getDay();
                      const diff = (day + 6) % 7;
                      d.setDate(d.getDate() - diff);
                      return d.toISOString().split("T")[0];
                    })();
                    const updateSwDay = (variant: "A" | "B", key: typeof DAY_KEYS[number], val: number) => {
                      const next: any = { ...sw };
                      if (variant === "A") {
                        next[key] = val;
                      } else {
                        next.woche_b = { ...(next.woche_b || { mo: 0, di: 0, mi: 0, do: 0, fr: 0, sa: 0, so: 0 }), [key]: val };
                      }
                      setFormData({ ...formData, schwellenwert: next });
                    };
                    const renderSwGrid = (variant: "A" | "B") => {
                      const weekData: any = variant === "A" ? sw : (sw.woche_b as any) || {};
                      return (
                        <div className="grid grid-cols-7 gap-2">
                          {DAY_KEYS.map((key, idx) => (
                            <div key={key} className="space-y-1 text-center">
                              <Label className="text-xs font-bold">{DAY_LABELS[idx]}</Label>
                              <Input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                value={weekData[key] ?? 0}
                                onChange={(e) => updateSwDay(variant, key, parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs px-1 text-center"
                                placeholder="h"
                              />
                            </div>
                          ))}
                        </div>
                      );
                    };
                    return (
                      <>
                        <Separator />
                        <div>
                          <h3 className="text-lg font-semibold mb-3">Schwellenwerte (Lohn vs. Zeitausgleich)</h3>
                          <p className="text-xs text-muted-foreground mb-3">
                            Stunden bis zum Schwellenwert pro Tag werden als <strong>Lohnstunden</strong> verrechnet, alles darüber geht ins <strong>Zeitausgleichs-Konto</strong>.
                          </p>

                          <div className="flex items-center gap-2 mb-3">
                            <input
                              type="checkbox"
                              id="sw-biweekly"
                              checked={isBiweekly}
                              onChange={(e) => {
                                const next: any = { ...sw };
                                if (e.target.checked) {
                                  next.zyklus = "biweekly";
                                  next.woche_b = next.woche_b || { mo: 0, di: 0, mi: 0, do: 0, fr: 0, sa: 0, so: 0 };
                                  next.zyklus_anker = next.zyklus_anker || ankerDefault;
                                } else {
                                  next.zyklus = "weekly";
                                }
                                setFormData({ ...formData, schwellenwert: next });
                              }}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="sw-biweekly" className="text-sm cursor-pointer">
                              14-tägige Durchrechnung (Woche A / Woche B)
                            </Label>
                          </div>

                          {isBiweekly && (
                            <div className="mb-3">
                              <Label className="text-xs">Anker-Datum (Montag der ersten Woche A)</Label>
                              <Input
                                type="date"
                                value={(sw as any).zyklus_anker || ankerDefault}
                                onChange={(e) => setFormData({ ...formData, schwellenwert: { ...sw, zyklus_anker: e.target.value } as any })}
                                className="mt-1 max-w-xs"
                              />
                            </div>
                          )}

                          {isBiweekly ? (
                            <Tabs defaultValue="A">
                              <TabsList>
                                <TabsTrigger value="A">Woche A (kurz)</TabsTrigger>
                                <TabsTrigger value="B">Woche B (lang)</TabsTrigger>
                              </TabsList>
                              <TabsContent value="A" className="pt-3">{renderSwGrid("A")}</TabsContent>
                              <TabsContent value="B" className="pt-3">{renderSwGrid("B")}</TabsContent>
                            </Tabs>
                          ) : (
                            renderSwGrid("A")
                          )}
                        </div>
                      </>
                    );
                  })()}

                  {!isExternalLikeKategorie(formData.kategorie) && (
                  <>
                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Bankverbindung</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>IBAN</Label>
                        <Input
                          value={formData.iban || ""}
                          onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                          placeholder="AT12 3456 7890 1234 5678"
                        />
                      </div>
                      <div>
                        <Label>BIC</Label>
                        <Input
                          value={formData.bic || ""}
                          onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                          placeholder="BKAUATWW"
                        />
                      </div>
                      <div>
                        <Label>Bank</Label>
                        <Input
                          value={formData.bank_name || ""}
                          onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Arbeitskleidung</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Kleidungsgröße</Label>
                        <Select
                          value={formData.kleidungsgroesse || ""}
                          onValueChange={(v) => setFormData({ ...formData, kleidungsgroesse: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {["S", "M", "L", "XL", "XXL", "XXXL"].map((size) => (
                              <SelectItem key={size} value={size}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Schuhgröße</Label>
                        <Select
                          value={formData.schuhgroesse || ""}
                          onValueChange={(v) => setFormData({ ...formData, schuhgroesse: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 17 }, (_, i) => 36 + i).map((size) => (
                              <SelectItem key={size} value={size.toString()}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  </>
                  )}

                  <Separator />

                  <div>
                    <Label>Notizen</Label>
                    <Textarea
                      value={formData.notizen || ""}
                      onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                      rows={4}
                      placeholder="Sonstige Anmerkungen..."
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setSelectedEmployee(null)}>
                      Abbrechen
                    </Button>
                    <Button type="submit">Speichern</Button>
                  </div>
                </form>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Dokumente */}
            <TabsContent value="dokumente">
              {selectedEmployee && (
                <EmployeeDocumentsManager
                  employeeId={selectedEmployee.id}
                  userId={selectedEmployee.user_id || selectedEmployee.id}
                />
              )}
            </TabsContent>

            {/* Tab 3: Überstunden */}
            <TabsContent value="stunden">
              <div className="space-y-4 p-4">
                <p className="text-sm text-muted-foreground">
                  Zur vollständigen Stundenauswertung wechseln Sie bitte zur Stundenauswertung-Seite.
                </p>
                <Button
                  onClick={() => {
                    if (selectedEmployee?.user_id) {
                      navigate(`/hours-report?employee=${selectedEmployee.user_id}`);
                      setSelectedEmployee(null);
                    } else {
                      toast({
                        title: "Keine User-ID",
                        description: "Dieser Mitarbeiter hat noch keinen Benutzer-Account",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="w-full"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Zur Stundenauswertung
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Create-Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Mitarbeiter</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEmployee} className="space-y-4">
            <div>
              <Label>Kategorie</Label>
              <Select
                value={newEmployee.kategorie}
                onValueChange={(v) => setNewEmployee({ ...newEmployee, kategorie: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lehrling">Lehrling</SelectItem>
                  <SelectItem value="facharbeiter">Facharbeiter</SelectItem>
                  <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                  <SelectItem value="extern">Extern</SelectItem>
                  <SelectItem value="bauherr">Bauherr</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vorname *</Label>
              <Input
                value={newEmployee.vorname}
                onChange={(e) => setNewEmployee({ ...newEmployee, vorname: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Nachname *</Label>
              <Input
                value={newEmployee.nachname}
                onChange={(e) => setNewEmployee({ ...newEmployee, nachname: e.target.value })}
                required
              />
            </div>
            {!isExternalLikeKategorie(newEmployee.kategorie) && (
              <div>
                <Label>E-Mail (optional)</Label>
                <Input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                />
              </div>
            )}
            <Button type="submit" className="w-full">
              Mitarbeiter anlegen
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Größen-Übersicht Dialog */}
      <Dialog open={showSizesDialog} onOpenChange={setShowSizesDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="w-5 h-5" />
              Arbeitskleidung & Schuhgrößen - Übersicht
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[600px]">
            <div className="rounded-md border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Position</th>
                    <th className="px-4 py-3 text-center font-semibold">Kleidungsgröße</th>
                    <th className="px-4 py-3 text-center font-semibold">Schuhgröße</th>
                  </tr>
                </thead>
                <tbody>
                  {employees
                    .sort((a, b) => a.nachname.localeCompare(b.nachname))
                    .map((emp, idx) => (
                      <tr 
                        key={emp.id} 
                        className={`border-t hover:bg-muted/30 cursor-pointer transition-colors ${
                          idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                        }`}
                        onClick={() => {
                          setShowSizesDialog(false);
                          setSelectedEmployee(emp);
                        }}
                      >
                        <td className="px-4 py-3 font-medium">
                          {emp.vorname} {emp.nachname}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {emp.position || "Mitarbeiter"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.kleidungsgroesse ? (
                            <span className="inline-flex items-center justify-center w-12 h-8 rounded-md bg-primary/10 text-primary font-semibold">
                              {emp.kleidungsgroesse}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.schuhgroesse ? (
                            <span className="inline-flex items-center justify-center w-12 h-8 rounded-md bg-secondary/50 text-secondary-foreground font-semibold">
                              {emp.schuhgroesse}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {employees.filter(e => !e.kleidungsgroesse && !e.schuhgroesse).length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  ℹ️ {employees.filter(e => !e.kleidungsgroesse && !e.schuhgroesse).length} Mitarbeiter 
                  haben noch keine Größenangaben. Klicke auf einen Mitarbeiter um die Daten zu ergänzen.
                </p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
