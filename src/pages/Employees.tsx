import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { DEFAULT_SCHEDULE, LEHRLING_SCHEDULE, type WeekSchedule } from "@/lib/workingHours";

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
  is_external: boolean | null;
}

const KATEGORIE_LABELS: Record<string, string> = {
  lehrling: "Lehrling",
  facharbeiter: "Facharbeiter",
  vorarbeiter: "Vorarbeiter",
  extern: "Extern",
};

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

  useEffect(() => {
    checkAdminAccess();
    fetchEmployees();
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
      const isExtern = newEmployee.kategorie === "extern";
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
                  <Badge variant={emp.kategorie === "extern" ? "outline" : "secondary"} className="text-xs">
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
              {selectedEmployee?.user_id && (
                <Button
                  variant={profileActiveMap[selectedEmployee.user_id] === false ? "default" : "destructive"}
                  size="sm"
                  onClick={() => handleToggleActive(selectedEmployee)}
                >
                  {profileActiveMap[selectedEmployee.user_id] === false ? "Aktivieren" : "Sperren"}
                </Button>
              )}
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
                      {formData.kategorie !== "extern" && (
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
                          placeholder={formData.kategorie === "extern" ? "z.B. Subunternehmer" : "z.B. Zimmermann"}
                        />
                      </div>
                      {formData.kategorie !== "extern" && (
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
                            const updates: Partial<Employee> = { kategorie: v, is_external: v === "extern" };
                            if (v === "lehrling") {
                              updates.regelarbeitszeit = LEHRLING_SCHEDULE;
                              updates.wochen_soll_stunden = 39;
                            } else if (v === "facharbeiter" || v === "vorarbeiter") {
                              updates.regelarbeitszeit = DEFAULT_SCHEDULE;
                              updates.wochen_soll_stunden = 39;
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

                  {/* Regelarbeitszeit (mit optionaler 14-taegiger Durchrechnung) */}
                  {formData.kategorie !== "extern" && (() => {
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
                            const updateDay = (field: "start" | "end" | "hours" | "pause", val: any) => {
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
                                <Input
                                  type="time"
                                  value={day.start || ""}
                                  onChange={(e) => updateDay("start", e.target.value || null)}
                                  className="h-8 text-xs px-1"
                                  placeholder="--:--"
                                />
                                <Input
                                  type="time"
                                  value={day.end || ""}
                                  onChange={(e) => updateDay("end", e.target.value || null)}
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
                                <Input
                                  type="number" min="0" max="120" step="5"
                                  value={day.pause || 0}
                                  onChange={(e) => updateDay("pause", parseInt(e.target.value) || 0)}
                                  className="h-8 text-xs px-1"
                                  placeholder="min"
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
                          Pro Tag von oben nach unten: Beginn / Ende / Stunden / Pause (Minuten).
                        </p>
                      </div>
                    );
                  })()}

                  {formData.kategorie !== "extern" && (
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
            {newEmployee.kategorie !== "extern" && (
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
