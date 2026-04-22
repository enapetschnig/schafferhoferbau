import { useEffect, useState, FormEvent, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Shield, User as UserIcon, UserPlus, Send, Mail, Phone, MapPin, Shirt, FileText, Clock, Trash2, Settings, Save, Calendar, Menu, Plus, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import * as XLSX from "xlsx-js-style";
import EmployeeDocumentsManager from "@/components/EmployeeDocumentsManager";
import { PayslipBulkUploadDialog } from "@/components/PayslipBulkUploadDialog";
import LeaveManagement from "@/components/LeaveManagement";
import TimeAccountManagement from "@/components/TimeAccountManagement";
import { ContactTemplatesManager } from "@/components/admin/ContactTemplatesManager";
import { YearPlanningRolesPanel } from "@/components/admin/YearPlanningRolesPanel";
import { WarehouseCategoriesManager } from "@/components/admin/WarehouseCategoriesManager";
import { BatchEmployeeSettings } from "@/components/BatchEmployeeSettings";

type Profile = {
  id: string;
  vorname: string;
  nachname: string;
  is_active: boolean | null;
};

type UserRole = {
  user_id: string;
  role: string;
};

type SickNote = {
  id: string;
  datum: string;
  user_id: string;
  notizen: string | null;
  profiles: {
    vorname: string;
    nachname: string;
  };
};

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
  wochen_soll_stunden: number | null;
  stundenlohn: number | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  kleidungsgroesse: string | null;
  schuhgroesse: string | null;
  notizen: string | null;
  land: string | null;
  kategorie?: string | null;
  schwellenwert?: Record<string, any> | null;
  sichtbarkeit?: Record<string, boolean> | null;
  urlaub_einheit_preferred?: "tage" | "stunden" | null;
}

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // User roles states
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [inviteTelefon, setInviteTelefon] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  
  // Employee management states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showSizesDialog, setShowSizesDialog] = useState(false);
  const [showPayslipUpload, setShowPayslipUpload] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>({});
  const [activeEmployeeTab, setActiveEmployeeTab] = useState<'stammdaten' | 'dokumente' | 'stunden'>('stammdaten');
  
  // Sick notes states
  const [sickNotes, setSickNotes] = useState<SickNote[]>([]);

  // Delete user dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [exportingBeforeDelete, setExportingBeforeDelete] = useState(false);

  // Employee save state
  const [savingEmployee, setSavingEmployee] = useState(false);

  // App settings states
  const [regiereportEmail, setRegiereportEmail] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Stundenerfassung system settings
  const [dashboardMsg, setDashboardMsg] = useState("");
  const [kilometergeldRate, setKilometergeldRate] = useState("0.42");
  const [showUeberstunden, setShowUeberstunden] = useState(true);
  const [showKilometergeld, setShowKilometergeld] = useState(true);
  const [showZusatzaufwendungen, setShowZusatzaufwendungen] = useState(false);

  // Pending user activation states
  const [pendingKategorie, setPendingKategorie] = useState<Record<string, string>>({});

  // Menu settings state
  const [menuSettings, setMenuSettings] = useState<Record<string, Record<string, boolean>>>({});
  const [savingMenuSettings, setSavingMenuSettings] = useState(false);

  const fetchAppSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", [
          "disturbance_report_email",
          "kilometergeld_rate",
          "show_ueberstunden",
          "show_kilometergeld",
          "show_zusatzaufwendungen",
          "dashboard_message",
        ]);

      if (error) {
        console.error("Error fetching app settings:", error);
      } else if (data) {
        const map = new Map(data.map((d) => [d.key, d.value]));
        if (map.has("disturbance_report_email")) setRegiereportEmail(map.get("disturbance_report_email")!);
        if (map.has("kilometergeld_rate")) setKilometergeldRate(map.get("kilometergeld_rate")!);
        if (map.has("show_ueberstunden")) setShowUeberstunden(map.get("show_ueberstunden") !== "false");
        if (map.has("show_kilometergeld")) setShowKilometergeld(map.get("show_kilometergeld") !== "false");
        if (map.has("show_zusatzaufwendungen")) setShowZusatzaufwendungen(map.get("show_zusatzaufwendungen") === "true");
        if (map.has("dashboard_message")) setDashboardMsg(map.get("dashboard_message")!);
      }
    } catch (err) {
      console.error("Error fetching app settings:", err);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const fetchMenuSettings = useCallback(async () => {
    const { data, error } = await supabase.from("role_menu_settings").select("role, menu_key, visible");
    if (error) {
      console.error("Error fetching menu settings:", error);
      return;
    }
    const map: Record<string, Record<string, boolean>> = {};
    (data ?? []).forEach(row => {
      if (!map[row.role]) map[row.role] = {};
      map[row.role][row.menu_key] = row.visible;
    });
    setMenuSettings(map);
  }, []);

  const saveMenuSettings = async () => {
    setSavingMenuSettings(true);
    const rows = Object.entries(menuSettings).flatMap(([role, keys]) =>
      Object.entries(keys).map(([menu_key, visible]) => ({ role, menu_key, visible }))
    );
    const { error } = await supabase.from("role_menu_settings").upsert(rows, { onConflict: "role,menu_key" });
    setSavingMenuSettings(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Menü-Einstellungen gespeichert" });
    }
  };

  const saveRegiereportEmail = async () => {
    if (!regiereportEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast({
        variant: "destructive",
        title: "Ungültige E-Mail",
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      });
      return;
    }

    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ 
          key: "disturbance_report_email", 
          value: regiereportEmail,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Gespeichert",
        description: "E-Mail-Adresse wurde aktualisiert.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: err.message || "Einstellung konnte nicht gespeichert werden.",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    checkAdminAccess();
    fetchUsers();
    fetchEmployees();
    fetchSickNotes();
    fetchAppSettings();
    fetchMenuSettings();
  }, [fetchAppSettings, fetchMenuSettings]);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "administrator") {
      navigate("/");
    }
  };

  const fetchUsers = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, vorname, nachname, is_active")
      .order("nachname");

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (profilesData) {
      setProfiles(profilesData);
    }

    if (rolesData) {
      const rolesMap: Record<string, string> = {};
      rolesData.forEach((role: UserRole) => {
        rolesMap[role.user_id] = role.role;
      });
      setUserRoles(rolesMap);
    }

    if (!silent) setLoading(false);
  };

  const scrollToRegisteredUser = (userId: string) => {
    // Wait a tick so the list can re-render after state updates
    window.setTimeout(() => {
      const el = document.getElementById(`registered-user-${userId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
        window.setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
        }, 1600);
      }
    }, 50);
  };

  const handleActivateUser = async (userId: string, activate: boolean) => {
    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update({ is_active: activate })
      .eq("id", userId)
      .select("id, is_active")
      .single();

    if (error || !updatedProfile) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error?.message || "Aktivierung fehlgeschlagen (keine Berechtigung oder Benutzer nicht gefunden).",
      });
      return;
    }

    // Optimistic UI update (avoids full-page loading spinner + losing scroll position)
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, is_active: activate } : p))
    );

    toast({
      title: activate ? "Benutzer aktiviert" : "Benutzer deaktiviert",
      description: activate
        ? "Der Benutzer kann sich jetzt anmelden."
        : "Der Benutzer kann sich nicht mehr anmelden.",
    });

    // Refresh in background to stay in sync
    fetchUsers({ silent: true });

    // If activated, jump to the user in the "Registrierte Benutzer" list
    if (activate) scrollToRegisteredUser(userId);
  };

  const handleActivateWithRole = async (userId: string) => {
    const kategorie = pendingKategorie[userId] || "facharbeiter";

    // 1. Activate user
    const { error: activateError } = await supabase
      .from("profiles")
      .update({ is_active: true })
      .eq("id", userId);

    if (activateError) {
      toast({ variant: "destructive", title: "Fehler", description: activateError.message });
      return;
    }

    // 2. Create/update employee with kategorie
    const profile = profiles.find(p => p.id === userId);
    const { data: existingEmp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingEmp) {
      await supabase.from("employees").update({ kategorie }).eq("id", existingEmp.id);
    } else {
      await supabase.from("employees").insert({
        user_id: userId,
        vorname: profile?.vorname || "",
        nachname: profile?.nachname || "",
        kategorie,
      });
    }

    // 3. Notify user
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("notifications").insert({
      user_id: userId,
      created_by: user?.id,
      type: "account_activated",
      title: "Konto freigeschaltet",
      message: "Dein Konto wurde vom Administrator freigeschaltet. Du kannst die App jetzt nutzen.",
      metadata: {},
    });

    // 4. Update UI
    setProfiles(prev => prev.map(p => p.id === userId ? { ...p, is_active: true } : p));
    toast({ title: "Mitarbeiter freigeschaltet", description: `${profile?.vorname} ${profile?.nachname} kann sich jetzt anmelden.` });
    fetchUsers({ silent: true });
    fetchEmployees();
    scrollToRegisteredUser(userId);
  };

  const handleRejectUser = async (userId: string) => {
    const profile = profiles.find(p => p.id === userId);
    if (!confirm(`${profile?.vorname} ${profile?.nachname} wirklich ablehnen und loeschen?`)) return;

    // Delete profile (cascades to related data)
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    setProfiles(prev => prev.filter(p => p.id !== userId));
    toast({ title: "Abgelehnt", description: `${profile?.vorname} ${profile?.nachname} wurde abgelehnt und entfernt.` });
  };

  const exportUserTimeEntries = async (userId: string, userName: string): Promise<boolean> => {
    try {
      const { data: entries } = await supabase
        .from("time_entries")
        .select("datum, start_time, end_time, stunden, taetigkeit, location_type, pause_minutes, projects(name, plz)")
        .eq("user_id", userId)
        .order("datum")
        .order("start_time");

      if (!entries || entries.length === 0) {
        return false;
      }

      const toMin = (t: string) => {
        const [h, m] = (t || "00:00").substring(0, 5).split(":").map(Number);
        return h * 60 + m;
      };

      const monthNames = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

      // Group entries by month
      const byMonth: Record<string, typeof entries> = {};
      for (const e of entries) {
        const [y, m] = e.datum.split("-");
        const key = `${y}-${m}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(e);
      }

      const wb = XLSX.utils.book_new();

      // Generate months from March 2026 to current month
      const startYear = 2026;
      const startMonth = 3;
      const now = new Date();
      const endYear = now.getFullYear();
      const endMonth = now.getMonth() + 1;

      for (let y = startYear; y <= endYear; y++) {
        const mStart = y === startYear ? startMonth : 1;
        const mEnd = y === endYear ? endMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
          const key = `${y}-${m.toString().padStart(2, "0")}`;
          const monthEntries = byMonth[key];
          if (!monthEntries || monthEntries.length === 0) continue;

          const wsData: any[][] = [
            [`${monthNames[m - 1]} ${y} — ${userName}`],
            [""],
            ["Datum", "Beginn", "Ende", "Pause", "Stunden", "Ort", "Projekt", "PLZ", "Tätigkeit"],
          ];

          for (const e of monthEntries) {
            const startMin = toMin(e.start_time);
            const endMin = toMin(e.end_time);
            const pauseMins = e.pause_minutes || 0;
            const hours = Math.max(0, (endMin - startMin - pauseMins) / 60);
            const proj = (e as any).projects;

            wsData.push([
              e.datum,
              e.start_time?.substring(0, 5) || "",
              e.end_time?.substring(0, 5) || "",
              pauseMins > 0 ? `${pauseMins} Min.` : "",
              hours.toFixed(2),
              e.location_type === "baustelle" ? "Baustelle" : "Lager",
              proj?.name || "",
              proj?.plz || "",
              e.taetigkeit || "",
            ]);
          }

          const ws = XLSX.utils.aoa_to_sheet(wsData);
          ws["!cols"] = [
            { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
            { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 30 },
          ];
          const sheetName = `${monthNames[m - 1]} ${y}`.substring(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
      }

      if (wb.SheetNames.length === 0) return false;

      const fileName = `Arbeitszeitdaten_${userName.replace(/\s/g, "_")}.xlsx`;

      // Download locally
      XLSX.writeFile(wb, fileName);

      // Also save to Supabase Storage as backup
      try {
        const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([xlsxBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const storagePath = `${userId}/${fileName}`;
        await supabase.storage
          .from("deleted-users")
          .upload(storagePath, blob, { upsert: true });
      } catch {
        // Storage backup is best-effort, don't block deletion
      }

      return true;
    } catch (err) {
      toast({ variant: "destructive", title: "Fehler", description: "Export fehlgeschlagen." });
      return false;
    }
  };

  const fetchEmployees = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("nachname");

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setEmployees(data || []);
    }
  };

  const fetchSickNotes = async () => {
    const { data: timeEntriesData, error } = await supabase
      .from("time_entries")
      .select("id, datum, user_id, notizen")
      .eq("taetigkeit", "Krankenstand")
      .not("notizen", "is", null)
      .like("notizen", "Krankmeldung:%")
      .order("datum", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching sick notes:", error);
      return;
    }

    if (!timeEntriesData || timeEntriesData.length === 0) {
      setSickNotes([]);
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(timeEntriesData.map(entry => entry.user_id))];
    
    // Fetch profiles for these users
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, vorname, nachname")
      .in("id", userIds);

    if (!profilesData) {
      setSickNotes([]);
      return;
    }

    // Map profiles to time entries
    const profilesMap = new Map(profilesData.map(p => [p.id, p]));
    const sickNotesWithProfiles = timeEntriesData
      .filter(entry => profilesMap.has(entry.user_id))
      .map(entry => ({
        ...entry,
        profiles: {
          vorname: profilesMap.get(entry.user_id)!.vorname,
          nachname: profilesMap.get(entry.user_id)!.nachname,
        }
      }));

    setSickNotes(sickNotesWithProfiles);
  };

  const handleDeleteSickNote = async (noteId: string, documentPath: string | null) => {
    if (!confirm("Möchten Sie diese Krankmeldung wirklich löschen?")) {
      return;
    }

    try {
      // Delete the document from storage if it exists
      if (documentPath) {
        const sanitizedPath = documentPath
          .replace("Krankmeldung: ", "")
          .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(sign|public)\/employee-documents\//, "")
          .replace(/^employee-documents\//, "")
          .replace(/^\/+/, "")
          .trim();

        const { error: storageError } = await supabase.storage
          .from("employee-documents")
          .remove([sanitizedPath]);

        if (storageError) {
          console.error("Storage deletion error:", storageError);
        }
      }

      // Delete the time entry
      const { error: dbError } = await supabase
        .from("time_entries")
        .delete()
        .eq("id", noteId);

      if (dbError) throw dbError;

      toast({
        title: "Gelöscht",
        description: "Krankmeldung wurde erfolgreich gelöscht.",
      });

      fetchSickNotes();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message || "Krankmeldung konnte nicht gelöscht werden",
      });
    }
  };

  const handleInviteSend = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!inviteTelefon.match(/^\+43\d{9,13}$/)) {
      toast({
        variant: "destructive",
        title: "Ungültige Telefonnummer",
        description: "Bitte Format +43... verwenden",
      });
      return;
    }

    setSendingInvite(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-invitation', {
        body: { telefonnummer: inviteTelefon }
      });

      if (error) {
        throw error;
      }

      // Check if the function returned an application error
      if (data && !data.success) {
        toast({
          variant: "destructive",
          title: "Fehler beim Senden",
          description: data.error || "Ein Fehler ist aufgetreten",
        });
        return;
      }

      toast({
        title: "SMS gesendet!",
        description: `Einladung wurde an ${inviteTelefon} gesendet.`,
      });
      setInviteTelefon("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Fehler beim Senden",
        description: error.message || "Ein Fehler ist aufgetreten",
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const getEffectiveRoleFor = (userId: string) =>
    userRoles[userId] === "administrator"
      ? "administrator"
      : (employees.find(e => e.user_id === userId)?.kategorie ?? "facharbeiter");

  const handleRoleChange = async (userId: string, newEffectiveRole: string) => {
    const systemRole = newEffectiveRole === "administrator" ? "administrator" : "mitarbeiter";

    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role: systemRole })
      .eq("user_id", userId);

    if (roleError) {
      toast({ variant: "destructive", title: "Fehler", description: roleError.message });
      return;
    }

    if (systemRole === "mitarbeiter") {
      const { error: empError } = await supabase
        .from("employees")
        .update({ kategorie: newEffectiveRole })
        .eq("user_id", userId);
      if (empError) {
        toast({ variant: "destructive", title: "Fehler", description: empError.message });
        return;
      }
    }

    toast({ title: "Erfolg", description: "Rolle wurde geändert." });
    setUserRoles((prev) => ({ ...prev, [userId]: systemRole }));
    fetchEmployees();
  };

  const ensureEmployeeForUser = async (userId: string) => {
    // 1) Try to find existing employee linked to this user
    const { data: existing, error: findErr } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (findErr) {
      toast({ variant: 'destructive', title: 'Fehler', description: findErr.message });
      return null;
    }
    if (existing) return existing as Employee;

    // 2) If not found, try to attach an existing employee record by name (user_id currently null)
    const profile = profiles.find(p => p.id === userId);
    if (!profile) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Profil nicht gefunden' });
      return null;
    }

    const { data: byName, error: byNameErr } = await supabase
      .from('employees')
      .select('*')
      .is('user_id', null)
      .eq('vorname', profile.vorname)
      .eq('nachname', profile.nachname);

    if (byNameErr) {
      toast({ variant: 'destructive', title: 'Fehler', description: byNameErr.message });
      return null;
    }

    if (byName && byName.length === 1) {
      const candidate = byName[0] as Employee;
      const { data: updated, error: attachErr } = await supabase
        .from('employees')
        .update({ user_id: userId })
        .eq('id', candidate.id)
        .select()
        .single();

      if (attachErr) {
        toast({ variant: 'destructive', title: 'Fehler', description: attachErr.message });
        return null;
      }

      toast({ title: 'Verbunden', description: 'Bestehender Mitarbeiterdatensatz wurde verknüpft.' });
      fetchEmployees();
      return updated as Employee;
    }

    // 3) Otherwise create a fresh employee record linked to the user
    const insertPayload = {
      user_id: userId,
      vorname: profile.vorname || '',
      nachname: profile.nachname || '',
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('employees')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      toast({ variant: 'destructive', title: 'Fehler', description: insertErr.message });
      return null;
    }

    fetchEmployees();
    return inserted as Employee;
  };

  const openEmployeeEditorForUser = async (userId: string, tab: 'stammdaten' | 'dokumente' = 'stammdaten') => {
    setActiveEmployeeTab(tab);
    const emp = await ensureEmployeeForUser(userId);
    if (emp) setSelectedEmployee(emp);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || savingEmployee) return;

    setSavingEmployee(true);
    try {
      const { error } = await supabase
        .from("employees")
        .update(formData)
        .eq("id", selectedEmployee.id);

      if (error) throw error;

      // Keep profiles table in sync (name is displayed throughout the app)
      if (selectedEmployee.user_id) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ vorname: formData.vorname, nachname: formData.nachname })
          .eq("id", selectedEmployee.user_id);
        if (profileError) throw profileError;
      }

      toast({ title: "Erfolg", description: "Änderungen gespeichert" });
      fetchEmployees();
      fetchUsers({ silent: true });
      setSelectedEmployee(null);
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } finally {
      setSavingEmployee(false);
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      setFormData(selectedEmployee);
    }
  }, [selectedEmployee]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <img 
              src="/schafferhofer-logo.png"
              alt="Schafferhofer Bau"
              className="h-14 sm:h-20 w-auto max-w-[180px] sm:max-w-[240px] cursor-pointer hover:opacity-80 transition-opacity object-contain"
              onClick={() => navigate("/")}
            />
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold">Admin-Bereich</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 space-y-8">
        {/* ===== NEUE MITARBEITER FREISCHALTEN ===== */}
        {profiles.filter(p => !p.is_active).length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <UserPlus className="h-6 w-6 text-orange-600" />
              Neue Mitarbeiter freischalten
              <span className="bg-orange-500 text-white text-sm px-2.5 py-0.5 rounded-full">
                {profiles.filter(p => !p.is_active).length}
              </span>
            </h2>

            <Card className="mb-6 border-orange-400/50 bg-orange-50/50 dark:bg-orange-950/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5 text-orange-600" />
                  Wartende Registrierungen
                </CardTitle>
                <CardDescription>
                  Diese Mitarbeiter haben sich registriert und warten auf Freischaltung. Weise eine Rolle zu und aktiviere den Zugang.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profiles.filter(p => !p.is_active).map((profile) => (
                    <div key={profile.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-card">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-orange-100 text-orange-700">
                            {profile.vorname?.[0] || "?"}{profile.nachname?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {profile.vorname} {profile.nachname}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Wartet auf Freischaltung
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Select
                          value={pendingKategorie[profile.id] || "facharbeiter"}
                          onValueChange={(val) => setPendingKategorie(prev => ({ ...prev, [profile.id]: val }))}
                        >
                          <SelectTrigger className="w-full sm:w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lehrling">Lehrling</SelectItem>
                            <SelectItem value="facharbeiter">Facharbeiter</SelectItem>
                            <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                            <SelectItem value="extern">Extern</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleActivateWithRole(profile.id)}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Freischalten
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRejectUser(profile.id)}
                        >
                          Ablehnen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* ===== BENUTZERROLLEN SEKTION ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Benutzerrollen & Einladungen</h2>
          
          {/* Invitation Form */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Neuen Mitarbeiter einladen
              </CardTitle>
              <CardDescription>
                Senden Sie eine SMS mit dem Registrierungslink an einen neuen Mitarbeiter
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteSend} className="space-y-4">
                <div>
                  <Label htmlFor="telefon">Telefonnummer (Format: +43...)</Label>
                  <Input
                    id="telefon"
                    type="tel"
                    placeholder="+43664..."
                    value={inviteTelefon}
                    onChange={(e) => setInviteTelefon(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Format: +43 gefolgt von der Nummer ohne Leerzeichen
                  </p>
                </div>
                <Button type="submit" disabled={sendingInvite}>
                  {sendingInvite ? "Sendet..." : "SMS senden"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Administratoren
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">
                  {profiles.filter(p => userRoles[p.id] === "administrator").length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <UserIcon className="h-5 w-5 text-accent" />
                  Benutzerverwaltung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-accent">
                  {profiles.filter(p => userRoles[p.id] === "mitarbeiter").length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Users List */}
          <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Registrierte Benutzer</CardTitle>
            <CardDescription>
              Rollen verwalten und Mitarbeiterdaten/Dokumente bearbeiten
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowPayslipUpload(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Sammel-Lohnzettel
            </Button>
            <Button variant="outline" onClick={() => setShowSizesDialog(true)}>
              <Shirt className="w-4 h-4 mr-2" />
              Arbeitskleidung/Schuhe Größen
            </Button>
          </div>
        </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {profiles.filter(p => p.is_active).map((profile) => (
                  <div
                    key={profile.id}
                    id={`registered-user-${profile.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-lg border bg-card transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {profile.vorname[0]}
                          {profile.nachname[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {profile.vorname} {profile.nachname}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {getEffectiveRoleFor(profile.id) === "administrator" ? "Administrator" : getEffectiveRoleFor(profile.id)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Select
                        value={getEffectiveRoleFor(profile.id)}
                        onValueChange={(val) => handleRoleChange(profile.id, val)}
                      >
                        <SelectTrigger className="w-full sm:w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="administrator">Administrator</SelectItem>
                          <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                          <SelectItem value="facharbeiter">Facharbeiter</SelectItem>
                          <SelectItem value="lehrling">Lehrling</SelectItem>
                          <SelectItem value="extern">Extern</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => openEmployeeEditorForUser(profile.id, 'stammdaten')}
                        >
                          Bearbeiten
                        </Button>
                        <Button onClick={() => openEmployeeEditorForUser(profile.id, 'dokumente')}>
                          <FileText className="w-4 h-4 mr-2" />
                          Dokumente
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUserToDelete(profile);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          Deaktivieren
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sick Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Neue Krankmeldungen
              </CardTitle>
              <CardDescription>
                Zuletzt hochgeladene Krankmeldungen der Mitarbeiter
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sickNotes.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Keine Krankmeldungen vorhanden
                </p>
              ) : (
                <div className="space-y-3">
                  {sickNotes.map((note) => {
                    const documentPath = note.notizen?.replace("Krankmeldung: ", "");

                    return (
                      <div key={note.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {note.profiles.vorname[0]}
                              {note.profiles.nachname[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {note.profiles.vorname} {note.profiles.nachname}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(note.datum), "dd.MM.yyyy")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {documentPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                if (!documentPath) return;

                                const rawPath = documentPath.trim();

                                // Falls alter Eintrag bereits eine komplette URL enthält
                                if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
                                  window.open(rawPath, "_blank");
                                  return;
                                }

                                // Pfad bereinigen (entfernt evtl. Bucket-Präfixe oder führende Slashes)
                                const sanitizedPath = rawPath
                                  .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(sign|public)\/employee-documents\//, "")
                                  .replace(/^employee-documents\//, "")
                                  .replace(/^\/+/, "");

                                const { data, error } = await supabase.storage
                                  .from("employee-documents")
                                  .createSignedUrl(sanitizedPath, 300);

                                if (error) {
                                  console.error("Signed URL error:", error, { rawPath, sanitizedPath });
                                  toast({ 
                                    variant: "destructive", 
                                    title: "Fehler", 
                                    description: "Dokument konnte nicht geöffnet werden" 
                                  });
                                  return;
                                }

                                if (data?.signedUrl) {
                                  window.open(data.signedUrl, "_blank");
                                } else {
                                  toast({ 
                                    variant: "destructive", 
                                    title: "Fehler", 
                                    description: "Dokument konnte nicht geöffnet werden" 
                                  });
                                }
                              }}
                            >
                              Ansehen
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteSickNote(note.id, documentPath)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ===== URLAUBSVERWALTUNG ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Urlaubsverwaltung
          </h2>
          <LeaveManagement profiles={profiles.filter(p => p.is_active)} />
        </section>

        {/* Zeitkonto vorerst deaktiviert */}
        {false && (
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Zeitkonten & Zeitausgleich
          </h2>
          <TimeAccountManagement profiles={profiles.filter(p => p.is_active)} />
        </section>
        )}

        {/* ===== STUNDENERFASSUNG-EINSTELLUNGEN ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Stundenerfassung-Einstellungen
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Globale Einstellungen</CardTitle>
              <CardDescription>
                Diese Einstellungen gelten systemweit fuer alle Mitarbeiter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Dashboard-Nachricht (wird oben im Dashboard angezeigt)</Label>
                <Input
                  value={dashboardMsg}
                  onChange={(e) => setDashboardMsg(e.target.value)}
                  placeholder="z.B. Willkommen bei Schafferhofer Bau!"
                />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Kilometergeld (EUR/km)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={kilometergeldRate}
                    onChange={(e) => setKilometergeldRate(e.target.value)}
                    placeholder="0.42"
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-medium">Sichtbarkeit fuer Mitarbeiter</h4>
                <p className="text-sm text-muted-foreground">
                  Steuert welche Bereiche alle Mitarbeiter in der App sehen koennen.
                </p>
                {[
                  { checked: showUeberstunden, setter: setShowUeberstunden, label: "Ueberstunden / Zeitausgleichsstunden anzeigen" },
                  { checked: showKilometergeld, setter: setShowKilometergeld, label: "Kilometergeld anzeigen" },
                  { checked: showZusatzaufwendungen, setter: setShowZusatzaufwendungen, label: "Zusatzaufwendungen anzeigen" },
                ].map(({ checked, setter, label }) => (
                  <div key={label} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm">{label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={checked}
                      onChange={(e) => setter(e.target.checked)}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <BatchEmployeeSettings
                  employees={employees.map((e) => ({
                    id: e.id,
                    vorname: e.vorname,
                    nachname: e.nachname,
                    kategorie: e.kategorie,
                  }))}
                  onSaved={fetchEmployees}
                />
                <Button
                  disabled={savingSettings}
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      const settings = [
                        { key: "dashboard_message", value: dashboardMsg },
                        { key: "kilometergeld_rate", value: kilometergeldRate },
                        { key: "show_ueberstunden", value: showUeberstunden.toString() },
                        { key: "show_kilometergeld", value: showKilometergeld.toString() },
                        { key: "show_zusatzaufwendungen", value: showZusatzaufwendungen.toString() },
                      ];
                      for (const s of settings) {
                        await supabase.from("app_settings").upsert(s, { onConflict: "key" });
                      }
                      toast({ title: "Einstellungen gespeichert" });
                    } catch (err: any) {
                      toast({ variant: "destructive", title: "Fehler", description: err.message });
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {savingSettings ? "Speichert..." : "Einstellungen speichern"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ===== KONTAKT-VORLAGEN & STANDARD-KONTAKTE ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <UserIcon className="h-6 w-6" />
            Kontakt-Vorlagen & Standard-Kontakte
          </h2>
          <ContactTemplatesManager />
        </section>

        {/* ===== LAGER-KATEGORIEN ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Lager-Kategorien
          </h2>
          <WarehouseCategoriesManager />
        </section>

        {/* ===== PLANTAFEL-RECHTE ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Plantafel-Rechte
          </h2>
          <YearPlanningRolesPanel />
        </section>

        {/* ===== MENÜ-EINSTELLUNGEN ===== */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Menu className="h-6 w-6" />
            Menü-Einstellungen
          </h2>

          <Card>
            <CardHeader>
              <CardTitle>Sichtbarkeit pro Rolle</CardTitle>
              <CardDescription>
                Lege fest, welche Menüpunkte jede Rolle im Dashboard sieht
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const ROLES = [
                  { key: "extern", label: "Extern" },
                  { key: "lehrling", label: "Lehrling" },
                  { key: "facharbeiter", label: "Facharbeiter" },
                  { key: "vorarbeiter", label: "Vorarbeiter" },
                  { key: "admin", label: "Admin" },
                ];
                const MENU_ITEMS = [
                  { key: "zeiterfassung", label: "Zeiterfassung" },
                  { key: "projekte", label: "Projekte" },
                  { key: "meine_stunden", label: "Meine Stunden" },
                  { key: "regiearbeiten", label: "Regiearbeiten" },
                  { key: "tagesberichte", label: "Berichte" },
                  { key: "meine_dokumente", label: "Meine Dokumente" },
                  { key: "dokumentenbibliothek", label: "Dokumentenbibliothek" },
                  { key: "stundenubersicht", label: "Stundenübersicht" },
                  { key: "plantafel", label: "Plantafel" },
                  { key: "gerateverwaltung", label: "Geräteverwaltung" },
                  { key: "eingangsrechnungen", label: "Eingangsrechnungen" },
                  { key: "evaluierungen", label: "Evaluierungen" },
                  { key: "arbeitsschutz", label: "Arbeitsschutz" },
                  { key: "lieferscheine", label: "Lieferscheine" },
                  { key: "lagerverwaltung", label: "Lagerverwaltung" },
                  { key: "bestellungen", label: "Bestellungen" },
                  { key: "admin_bereich", label: "Admin-Bereich" },
                ];
                return (
                  <Tabs defaultValue="facharbeiter">
                    <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                      {ROLES.map(r => (
                        <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>
                      ))}
                    </TabsList>
                    {ROLES.map(role => (
                      <TabsContent key={role.key} value={role.key}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {MENU_ITEMS.map(item => (
                            <div key={item.key} className="flex items-center gap-3 p-3 rounded-lg border">
                              <Checkbox
                                id={`${role.key}-${item.key}`}
                                checked={menuSettings[role.key]?.[item.key] ?? true}
                                onCheckedChange={(checked) => {
                                  setMenuSettings(prev => ({
                                    ...prev,
                                    [role.key]: {
                                      ...(prev[role.key] ?? {}),
                                      [item.key]: !!checked,
                                    },
                                  }));
                                }}
                              />
                              <label
                                htmlFor={`${role.key}-${item.key}`}
                                className="text-sm font-medium cursor-pointer select-none"
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    ))}
                    <div className="flex justify-end mt-4">
                      <Button onClick={saveMenuSettings} disabled={savingMenuSettings}>
                        <Save className="h-4 w-4 mr-2" />
                        {savingMenuSettings ? "Speichert..." : "Einstellungen speichern"}
                      </Button>
                    </div>
                  </Tabs>
                );
              })()}
            </CardContent>
          </Card>
        </section>


      </main>

      {/* Employee Detail Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedEmployee?.vorname} {selectedEmployee?.nachname}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeEmployeeTab} onValueChange={(val) => setActiveEmployeeTab(val as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stammdaten">
                <UserIcon className="w-4 h-4 mr-2" />
                Stammdaten
              </TabsTrigger>
              <TabsTrigger value="dokumente">
                <FileText className="w-4 h-4 mr-2" />
                Dokumente
              </TabsTrigger>
              <TabsTrigger value="stunden">
                <Clock className="w-4 h-4 mr-2" />
                Stunden
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
                      <div>
                        <Label>Beschäftigungszeit in Wochenstunden</Label>
                        <Input
                          type="number"
                          min="0"
                          max="60"
                          step="0.5"
                          value={formData.wochen_soll_stunden ?? 39}
                          onChange={(e) => setFormData({ ...formData, wochen_soll_stunden: parseFloat(e.target.value) || 0 })}
                          placeholder="39"
                        />
                      </div>
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
                        <Label>Stundenlohn (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.stundenlohn || ""}
                          onChange={(e) => setFormData({ ...formData, stundenlohn: parseFloat(e.target.value) || null })}
                        />
                      </div>
                      <div>
                        <Label>SV-Nummer</Label>
                        <Input
                          value={formData.sv_nummer || ""}
                          onChange={(e) => setFormData({ ...formData, sv_nummer: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Mitarbeiterkategorie</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Kategorie</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={formData.kategorie || "facharbeiter"}
                          onChange={(e) => setFormData({ ...formData, kategorie: e.target.value })}
                        >
                          <option value="lehrling">Lehrling</option>
                          <option value="facharbeiter">Facharbeiter</option>
                          <option value="vorarbeiter">Vorarbeiter</option>
                          <option value="extern">Extern</option>
                        </select>
                      </div>
                      {formData.kategorie === "lehrling" && (
                        <div>
                          <Label>Arbeitszeitmodell</Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            14-Tage-Zyklus: Woche 1 = 5 Tage, Woche 2 = 4 Tage (Kurz/Lang abwechselnd).
                            Wird automatisch ueber die Regelarbeitszeit gesteuert.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Zeitausgleich-Schwellenwert</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Tagesgrenze: Stunden bis zum Schwellenwert werden ausbezahlt, darueber liegende Stunden gehen in den Zeitausgleich.
                    </p>
                    {(() => {
                      const labels: Record<string, string> = { mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So" };
                      const sw = (formData.schwellenwert as Record<string, any> | null) || {};
                      const isBiweekly = sw.zyklus === "biweekly";
                      const wocheB = (sw.woche_b as Record<string, number> | undefined) || {};

                      const updateSw = (changes: Record<string, any>) => {
                        const next = { ...sw, ...changes };
                        // Clean empty object
                        const hasAny =
                          next.zyklus ||
                          next.woche_b ||
                          next.zyklus_anker ||
                          ["mo", "di", "mi", "do", "fr", "sa", "so"].some((k) => typeof next[k] === "number");
                        setFormData({ ...formData, schwellenwert: hasAny ? next : null });
                      };

                      return (
                        <>
                          <div className="flex items-center justify-between mb-3 p-3 rounded-lg border bg-muted/30">
                            <div>
                              <Label className="text-sm font-medium">14-Tage-Zyklus (Woche A / Woche B)</Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                Fuer Lehrlinge mit wechselndem Kurz-/Langwochenrhythmus.
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={isBiweekly}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateSw({
                                    zyklus: "biweekly",
                                    woche_b: wocheB,
                                    zyklus_anker: sw.zyklus_anker || new Date().toISOString().slice(0, 10),
                                  });
                                } else {
                                  const { zyklus, woche_b, zyklus_anker, ...rest } = sw;
                                  setFormData({
                                    ...formData,
                                    schwellenwert: Object.keys(rest).length > 0 ? rest : null,
                                  });
                                }
                              }}
                            />
                          </div>
                          {isBiweekly && (
                            <div className="mb-3">
                              <Label className="text-xs">Zyklus-Anker (Montag der Woche A)</Label>
                              <Input
                                type="date"
                                className="w-48"
                                value={sw.zyklus_anker || ""}
                                onChange={(e) => updateSw({ zyklus_anker: e.target.value })}
                              />
                            </div>
                          )}
                          <Label className="text-xs font-semibold">{isBiweekly ? "Woche A" : "Pro Wochentag"}</Label>
                          <div className="grid grid-cols-7 gap-2 mt-1">
                            {(["mo", "di", "mi", "do", "fr", "sa", "so"] as const).map((day) => (
                              <div key={day} className="text-center">
                                <Label className="text-xs">{labels[day]}</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  className="text-center text-sm"
                                  value={typeof sw[day] === "number" ? sw[day] : ""}
                                  placeholder="-"
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                    const next = { ...sw };
                                    if (val === undefined) {
                                      delete next[day];
                                    } else {
                                      next[day] = val;
                                    }
                                    setFormData({
                                      ...formData,
                                      schwellenwert:
                                        Object.keys(next).some((k) => next[k] !== undefined) ? next : null,
                                    });
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          {isBiweekly && (
                            <>
                              <Label className="text-xs font-semibold mt-3 block">Woche B</Label>
                              <div className="grid grid-cols-7 gap-2 mt-1">
                                {(["mo", "di", "mi", "do", "fr", "sa", "so"] as const).map((day) => (
                                  <div key={day} className="text-center">
                                    <Label className="text-xs">{labels[day]}</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="24"
                                      step="0.5"
                                      className="text-center text-sm"
                                      value={wocheB[day] ?? ""}
                                      placeholder="-"
                                      onChange={(e) => {
                                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                        updateSw({ woche_b: { ...wocheB, [day]: val } });
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Sichtbarkeit fuer Mitarbeiter</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Steuert welche Bereiche der Mitarbeiter in &quot;Meine Stunden&quot; sehen kann.
                    </p>
                    <div className="space-y-3">
                      {[
                        { key: "auswertung", label: "Auswertung (Stundenueberblick)" },
                        { key: "zusatzaufwendungen", label: "Zusatzaufwendungen" },
                        { key: "fahrtengeld", label: "Fahrtengeld" },
                      ].map(({ key, label }) => {
                        const vis = (formData.sichtbarkeit as Record<string, boolean> | null) || { auswertung: true, zusatzaufwendungen: false, fahrtengeld: true };
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <Label>{label}</Label>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={vis[key] ?? false}
                              onChange={(e) => {
                                setFormData({ ...formData, sichtbarkeit: { ...vis, [key]: e.target.checked } });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  {/* Urlaubskonto — Einheit und manueller Override */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Urlaubskonto</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Die Basisdaten werden normalerweise automatisch aus dem neuesten Lohnzettel extrahiert.
                      Hier kannst du Einheit und Werte pro Mitarbeiter ueberschreiben.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Gefuehrte Einheit</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={formData.urlaub_einheit_preferred || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              urlaub_einheit_preferred: (e.target.value || null) as "tage" | "stunden" | null,
                            })
                          }
                        >
                          <option value="">Automatisch aus Lohnzettel</option>
                          <option value="tage">Tage</option>
                          <option value="stunden">Stunden (z.B. Mauerhofer)</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        {selectedEmployee?.user_id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const anspruch = window.prompt("Jahres-Urlaubsanspruch (leer = nicht setzen):", "");
                              const rest = window.prompt("Aktueller Resturlaub:", "");
                              const stichtag = window.prompt(
                                "Stichtag (YYYY-MM-DD):",
                                new Date().toISOString().slice(0, 10)
                              );
                              if (!rest || !stichtag) return;
                              const einheit = formData.urlaub_einheit_preferred || "tage";
                              const { error } = await (supabase.from("payslip_metadata") as any).insert({
                                user_id: selectedEmployee.user_id,
                                file_path: null,
                                release_date: stichtag,
                                urlaubsanspruch: anspruch ? parseFloat(anspruch.replace(",", ".")) : null,
                                resturlaub: parseFloat(rest.replace(",", ".")),
                                urlaub_einheit: einheit,
                                stichtag,
                              });
                              if (error) {
                                toast({
                                  title: "Fehler",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              } else {
                                toast({ title: "Urlaubskonto manuell gesetzt" });
                              }
                            }}
                          >
                            Urlaubskonto manuell setzen
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Bankverbindung</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>IBAN</Label>
                        <Input
                          value={formData.iban || ""}
                          onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>BIC</Label>
                        <Input
                          value={formData.bic || ""}
                          onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
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
                        <Input
                          value={formData.kleidungsgroesse || ""}
                          onChange={(e) => setFormData({ ...formData, kleidungsgroesse: e.target.value })}
                          placeholder="z.B. L, XL, XXL"
                        />
                      </div>
                      <div>
                        <Label>Schuhgröße</Label>
                        <Input
                          value={formData.schuhgroesse || ""}
                          onChange={(e) => setFormData({ ...formData, schuhgroesse: e.target.value })}
                          placeholder="z.B. 42, 43, 44"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Notizen</h3>
                    <Textarea
                      value={formData.notizen || ""}
                      onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                      rows={4}
                      placeholder="Interne Notizen zum Mitarbeiter..."
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setSelectedEmployee(null)}>
                      Abbrechen
                    </Button>
                    <Button type="submit" disabled={savingEmployee}>
                      {savingEmployee ? "Wird gespeichert..." : "Speichern"}
                    </Button>
                  </div>
                </form>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Dokumente */}
            <TabsContent value="dokumente">
              <ScrollArea className="h-[500px]">
                {selectedEmployee && (
                  <EmployeeDocumentsManager 
                    employeeId={selectedEmployee.id}
                    userId={selectedEmployee.user_id || undefined}
                  />
                )}
              </ScrollArea>
            </TabsContent>

            {/* Tab 3: Stunden */}
            <TabsContent value="stunden">
              <ScrollArea className="h-[500px]">
                <div className="p-4">
                  <Button
                    onClick={() => {
                      if (selectedEmployee) {
                        navigate(`/hours-report?employeeId=${selectedEmployee.id}`);
                      }
                    }}
                    className="w-full"
                  >
                    Zur Stundenauswertung
                  </Button>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Sizes Overview Dialog */}
      <Dialog open={showSizesDialog} onOpenChange={setShowSizesDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="w-5 h-5" />
              Arbeitskleidung & Schuhgrößen
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {employees
                .filter(emp => emp.kleidungsgroesse || emp.schuhgroesse)
                .sort((a, b) => a.nachname.localeCompare(b.nachname))
                .map((emp) => (
                  <div
                    key={emp.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setShowSizesDialog(false);
                      setSelectedEmployee(emp);
                    }}
                  >
                    <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="col-span-2">
                        <p className="font-medium">
                          {emp.vorname} {emp.nachname}
                        </p>
                        <p className="text-sm text-muted-foreground">{emp.position || "Mitarbeiter"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Kleidung</p>
                        <p className="font-semibold text-lg">
                          {emp.kleidungsgroesse || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Schuhe</p>
                        <p className="font-semibold text-lg">
                          {emp.schuhgroesse || "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              
              {employees.filter(emp => emp.kleidungsgroesse || emp.schuhgroesse).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Shirt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Noch keine Größenangaben vorhanden</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog - Step 1: Deaktivieren oder Löschen? */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Benutzer deaktivieren</DialogTitle>
            <DialogDescription>
              Möchten Sie {userToDelete?.vorname} {userToDelete?.nachname} nur deaktivieren oder komplett löschen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (userToDelete) {
                  handleActivateUser(userToDelete.id, false);
                }
                setDeleteDialogOpen(false);
                setUserToDelete(null);
              }}
            >
              Nur deaktivieren
            </Button>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmOpen(true);
              }}
            >
              Benutzer löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog - Step 2: Bestätigung */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => {
        setDeleteConfirmOpen(open);
        if (!open) setUserToDelete(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Benutzer löschen</DialogTitle>
            <DialogDescription>
              Möchten Sie <strong>{userToDelete?.vorname} {userToDelete?.nachname}</strong> wirklich löschen?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Alle Arbeitszeitdaten werden automatisch als Excel heruntergeladen bevor der Benutzer gelöscht wird.
              Projektbuchungen bleiben erhalten.
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={exportingBeforeDelete}
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setUserToDelete(null);
                }}
              >
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={exportingBeforeDelete}
                onClick={async () => {
                  if (!userToDelete) return;
                  setExportingBeforeDelete(true);

                  try {
                    const userName = `${userToDelete.vorname} ${userToDelete.nachname}`;

                    // 1. Auto-export Excel before deletion
                    await exportUserTimeEntries(userToDelete.id, userName);

                    // 2. Anonymize time entries: keep project data, mark deleted user
                    await supabase
                      .from("time_entries")
                      .update({ notizen: `[Gelöschter Benutzer: ${userName}]` })
                      .eq("user_id", userToDelete.id);

                    // 3. Delete disturbances (Regieberichte) for this user
                    await supabase.from("disturbances").delete().eq("user_id", userToDelete.id);

                    // 4. Delete employee record
                    await supabase.from("employees").delete().eq("user_id", userToDelete.id);

                    // 5. Delete user roles
                    await supabase.from("user_roles").delete().eq("user_id", userToDelete.id);

                    // 6. Delete notifications
                    await supabase.from("notifications").delete().eq("user_id", userToDelete.id);

                    // 7. Deactivate user (blocks app access)
                    await supabase
                      .from("profiles")
                      .update({ is_active: false })
                      .eq("id", userToDelete.id);

                    // 8. Delete profile (time_entries.user_id becomes NULL via SET NULL FK)
                    const { error: profileError } = await supabase
                      .from("profiles")
                      .delete()
                      .eq("id", userToDelete.id);

                    if (profileError) throw profileError;

                    toast({
                      title: "Benutzer gelöscht",
                      description: `${userName} wurde gelöscht. Excel wurde heruntergeladen.`,
                    });

                    fetchUsers({ silent: true });
                    fetchEmployees();
                  } catch (error: any) {
                    toast({
                      variant: "destructive",
                      title: "Fehler",
                      description: error.message || "Benutzer konnte nicht gelöscht werden",
                    });
                  }

                  setExportingBeforeDelete(false);
                  setDeleteConfirmOpen(false);
                  setUserToDelete(null);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {exportingBeforeDelete ? "Wird gelöscht..." : "Endgültig löschen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PayslipBulkUploadDialog
        open={showPayslipUpload}
        onOpenChange={setShowPayslipUpload}
      />
    </div>
  );
}
