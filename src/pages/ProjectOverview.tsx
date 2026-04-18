import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, FileCheck, Camera, ImagePlus, Lock, Plus, MapPin, Users, Copy, Pencil, Trash2, Phone, Mail, Shield, MessageCircle, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VoiceAIInput } from "@/components/VoiceAIInput";

type DocumentCategory = {
  type: "plans" | "reports" | "photos" | "chef" | "polier";
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  adminOnly?: boolean;
  polierOnly?: boolean;
};

type Contact = {
  id: string; name: string; rolle: string | null; telefon: string | null;
  email: string | null; firma: string | null; phase: string; notizen: string | null;
};

const ProjectOverview = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [projectInfo, setProjectInfo] = useState<{
    adresse: string | null; plz: string | null; bauherr: string | null;
    bauherr_kontakt: string | null; bauleiter: string | null;
    bauherr2: string | null; bauherr2_kontakt: string | null;
    baustellenart: string | null; anfahrt_ueber_100km: boolean | null;
    budget: number | null; start_datum: string | null; end_datum: string | null;
    beschreibung: string | null; kunde_telefon: string | null; kunde_email: string | null;
    erreichbarkeit: string | null; besonderheiten: string | null; hinweise: string | null;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVorarbeiter, setIsVorarbeiter] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<DocumentCategory[]>([
    {
      type: "photos",
      title: "Fotos",
      description: "Baufortschritt und Dokumentationsfotos",
      icon: <Camera className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "plans",
      title: "Pläne",
      description: "Baupläne und technische Zeichnungen",
      icon: <FileText className="h-8 w-8" />,
      count: 0,
    },
    // Regieberichte entfernt - gibt bereits "Berichte" Karte (Tages-/Regie-/Zwischenberichte)
    {
      type: "polier",
      title: "Polierordner",
      description: "Interner Datenaustausch Polier & Chef",
      icon: <FileText className="h-8 w-8" />,
      count: 0,
      polierOnly: true,
    },
    {
      type: "chef",
      title: "Chefordner",
      description: "Vertrauliche Chef-Dokumente",
      icon: <Lock className="h-8 w-8" />,
      count: 0,
      adminOnly: true,
    },
  ]);

  const [dailyReportCount, setDailyReportCount] = useState(0);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", rolle: "", telefon: "", email: "", firma: "", phase: "bauphase", notizen: "" });

  // Template picker state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; firma: string | null; rolle: string | null; telefon: string | null; email: string | null }[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [addingTemplates, setAddingTemplates] = useState(false);

  // Access management state
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [allEmployees, setAllEmployees] = useState<{ id: string; user_id: string | null; name: string }[]>([]);
  const [accessUserIds, setAccessUserIds] = useState<Set<string>>(new Set());
  const [savingAccess, setSavingAccess] = useState(false);

  // Edit project state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", beschreibung: "", adresse: "", plz: "",
    bauherr: "", bauherr_kontakt: "", bauleiter: "",
    bauherr2: "", bauherr2_kontakt: "",
    baustellenart: "" as string,
    anfahrt_ueber_100km: false,
    budget: "", start_datum: "", end_datum: "",
    kunde_telefon: "", kunde_email: "",
    erreichbarkeit: "", besonderheiten: "", hinweise: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditDialog = () => {
    if (!projectInfo) return;
    setEditForm({
      name: projectName,
      beschreibung: projectInfo.beschreibung || "",
      adresse: projectInfo.adresse || "",
      plz: projectInfo.plz || "",
      bauherr: projectInfo.bauherr || "",
      bauherr_kontakt: projectInfo.bauherr_kontakt || "",
      bauherr2: projectInfo.bauherr2 || "",
      bauherr2_kontakt: projectInfo.bauherr2_kontakt || "",
      baustellenart: projectInfo.baustellenart || "",
      anfahrt_ueber_100km: projectInfo.anfahrt_ueber_100km || false,
      bauleiter: projectInfo.bauleiter || "",
      budget: projectInfo.budget != null ? String(projectInfo.budget) : "",
      start_datum: projectInfo.start_datum || "",
      end_datum: projectInfo.end_datum || "",
      kunde_telefon: projectInfo.kunde_telefon || "",
      kunde_email: projectInfo.kunde_email || "",
      erreichbarkeit: projectInfo.erreichbarkeit || "",
      besonderheiten: projectInfo.besonderheiten || "",
      hinweise: projectInfo.hinweise || "",
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!projectId || !editForm.name.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from("projects")
      .update({
        name: editForm.name.trim(),
        beschreibung: editForm.beschreibung.trim() || null,
        adresse: editForm.adresse.trim() || null,
        plz: editForm.plz.trim() || null,
        bauherr: editForm.bauherr.trim() || null,
        bauherr_kontakt: editForm.bauherr_kontakt.trim() || null,
        bauherr2: editForm.bauherr2.trim() || null,
        bauherr2_kontakt: editForm.bauherr2_kontakt.trim() || null,
        baustellenart: editForm.baustellenart || null,
        anfahrt_ueber_100km: editForm.anfahrt_ueber_100km,
        bauleiter: editForm.bauleiter.trim() || null,
        budget: editForm.budget ? Number(editForm.budget) : null,
        start_datum: editForm.start_datum || null,
        end_datum: editForm.end_datum || null,
        kunde_telefon: editForm.kunde_telefon.trim() || null,
        kunde_email: editForm.kunde_email.trim() || null,
        erreichbarkeit: editForm.erreichbarkeit.trim() || null,
        besonderheiten: editForm.besonderheiten.trim() || null,
        hinweise: editForm.hinweise.trim() || null,
      })
      .eq("id", projectId);
    setSavingEdit(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Projekt aktualisiert" });
      setShowEditDialog(false);
      fetchProjectName();
    }
  };

  const fetchAccessData = async () => {
    if (!projectId) return;
    // Fetch employees with user_id
    const { data: empData } = await supabase
      .from("employees")
      .select("id, user_id, vorname, nachname")
      .not("user_id", "is", null)
      .order("nachname");
    if (empData) {
      setAllEmployees(empData.map(e => ({ id: e.id, user_id: e.user_id!, name: `${e.vorname} ${e.nachname}`.trim() })));
    }
    // Fetch current access
    const { data: accessData } = await supabase
      .from("project_access")
      .select("user_id")
      .eq("project_id", projectId);
    if (accessData) {
      setAccessUserIds(new Set(accessData.map((a: any) => a.user_id)));
    }
  };

  const handleToggleAccess = (userId: string) => {
    setAccessUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleSaveAccess = async () => {
    if (!projectId || !currentUserId) return;
    setSavingAccess(true);
    // Delete all existing access for this project
    await supabase.from("project_access").delete().eq("project_id", projectId);
    // Insert new access entries
    if (accessUserIds.size > 0) {
      const rows = Array.from(accessUserIds).map(uid => ({
        project_id: projectId,
        user_id: uid,
        granted_by: currentUserId,
      }));
      await supabase.from("project_access").insert(rows);
    }
    setSavingAccess(false);
    setShowAccessDialog(false);
    toast({ title: "Gespeichert", description: `Zugriff für ${accessUserIds.size} Mitarbeiter gespeichert` });
  };

  useEffect(() => {
    if (projectId) {
      checkAdminStatus();
      fetchProjectName();
      fetchContacts();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchFileCounts();
    }
  }, [projectId, isAdmin]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setCurrentUserId(user.id);

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "administrator")
      .maybeSingle();

    setIsAdmin(!!data);

    // Check if Vorarbeiter
    const { data: empData } = await supabase
      .from("employees")
      .select("kategorie")
      .eq("user_id", user.id)
      .maybeSingle();
    setIsVorarbeiter(empData?.kategorie === "vorarbeiter");
  };

  const fetchProjectName = async () => {
    if (!projectId) return;

    const { data } = await supabase
      .from("projects")
      .select("name, adresse, plz, bauherr, bauherr_kontakt, bauherr2, bauherr2_kontakt, baustellenart, anfahrt_ueber_100km, bauleiter, budget, start_datum, end_datum, beschreibung, kunde_telefon, kunde_email, erreichbarkeit, besonderheiten, hinweise")
      .eq("id", projectId)
      .single();

    if (data) {
      const d = data as any;
      setProjectName(d.name);
      setProjectInfo({
        adresse: d.adresse, plz: d.plz, bauherr: d.bauherr,
        bauherr_kontakt: d.bauherr_kontakt,
        bauherr2: d.bauherr2, bauherr2_kontakt: d.bauherr2_kontakt,
        baustellenart: d.baustellenart, anfahrt_ueber_100km: d.anfahrt_ueber_100km,
        bauleiter: d.bauleiter,
        budget: d.budget, start_datum: d.start_datum, end_datum: d.end_datum,
        beschreibung: d.beschreibung, kunde_telefon: d.kunde_telefon,
        kunde_email: d.kunde_email, erreichbarkeit: d.erreichbarkeit,
        besonderheiten: d.besonderheiten, hinweise: d.hinweise,
      });
    }

    const { count } = await supabase
      .from("daily_reports")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    setDailyReportCount(count ?? 0);
  };

  const fetchContacts = async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_contacts")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("name");
    if (data) setContacts(data as Contact[]);
  };

  const moveContact = async (contactId: string, direction: "up" | "down") => {
    const idx = contacts.findIndex(c => c.id === contactId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= contacts.length) return;

    const updates = [
      { id: contacts[idx].id, sort_order: swapIdx },
      { id: contacts[swapIdx].id, sort_order: idx },
    ];
    for (const u of updates) {
      await supabase.from("project_contacts").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    fetchContacts();
  };

  const handleSaveContact = async () => {
    if (!projectId || !contactForm.name.trim()) return;
    const payload = {
      project_id: projectId,
      name: contactForm.name.trim(),
      rolle: contactForm.rolle.trim() || null,
      telefon: contactForm.telefon.trim() || null,
      email: contactForm.email.trim() || null,
      firma: contactForm.firma.trim() || null,
      phase: contactForm.phase,
      notizen: contactForm.notizen.trim() || null,
    };

    if (editingContact) {
      const { error } = await supabase.from("project_contacts").update(payload).eq("id", editingContact.id);
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    } else {
      const { error } = await supabase.from("project_contacts").insert(payload);
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    }
    toast({ title: editingContact ? "Aktualisiert" : "Gespeichert" });
    resetContactDialog();
    fetchContacts();
  };

  const handleDeleteContact = async (id: string) => {
    const { error } = await supabase.from("project_contacts").delete().eq("id", id);
    if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    toast({ title: "Gelöscht" });
    fetchContacts();
  };

  const resetContactDialog = () => {
    setShowContactDialog(false);
    setEditingContact(null);
    setContactForm({ name: "", rolle: "", telefon: "", email: "", firma: "", phase: "bauphase", notizen: "" });
  };

  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setContactForm({
      name: c.name, rolle: c.rolle || "", telefon: c.telefon || "",
      email: c.email || "", firma: c.firma || "", phase: c.phase, notizen: c.notizen || "",
    });
    setShowContactDialog(true);
  };

  const copyContact = (c: Contact) => {
    const text = [c.name, c.firma, c.telefon, c.email].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Kopiert", description: "Kontaktdaten in Zwischenablage" });
  };

  const exportContactVCF = (c: Contact) => {
    const nameParts = c.name.split(" ");
    const lastName = nameParts.pop() || "";
    const firstName = nameParts.join(" ");
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${lastName};${firstName};;;`,
      `FN:${c.name}`,
      c.firma ? `ORG:${c.firma}` : "",
      c.rolle ? `TITLE:${c.rolle}` : "",
      c.telefon ? `TEL;TYPE=WORK:${c.telefon}` : "",
      c.email ? `EMAIL:${c.email}` : "",
      `NOTE:Projekt: ${projectName}`,
      "END:VCARD",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([vcf], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.name.replace(/\s+/g, "_")}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportContactsExcel = () => {
    const data = contacts.map(c => ({
      Name: c.name, Firma: c.firma || "", Rolle: c.rolle || "",
      Telefon: c.telefon || "", Email: c.email || "",
      Phase: c.phase === "planungsphase" ? "Planungsphase" : c.phase === "beide" ? "Alle Phasen" : "Bauphase",
      Notizen: c.notizen || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kontakte");
    XLSX.writeFile(wb, `Kontakte_${projectName.replace(/\s+/g, "_")}.xlsx`);
  };

  const importContactsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    // Bestehende Kontakte loeschen (laut Dokument: "beim Import werden alle ueberschrieben")
    await supabase.from("project_contacts").delete().eq("project_id", projectId);

    let imported = 0;
    for (const row of rows) {
      const name = (row["Name"] || row["name"] || "").toString().trim();
      if (!name) continue;
      const phaseRaw = (row["Phase"] || row["phase"] || "bauphase").toString().toLowerCase();
      const phase = phaseRaw.includes("plan") ? "planungsphase" : phaseRaw.includes("alle") || phaseRaw.includes("beide") ? "beide" : "bauphase";

      await supabase.from("project_contacts").insert({
        project_id: projectId,
        name,
        firma: (row["Firma"] || row["firma"] || "").toString() || null,
        rolle: (row["Rolle"] || row["rolle"] || "").toString() || null,
        telefon: (row["Telefon"] || row["telefon"] || "").toString() || null,
        email: (row["Email"] || row["email"] || row["E-Mail"] || "").toString() || null,
        phase,
        notizen: (row["Notizen"] || row["notizen"] || "").toString() || null,
      });
      imported++;
    }
    toast({ title: `${imported} Kontakte importiert` });
    fetchContacts();
    e.target.value = "";
  };

  const openTemplatePicker = async () => {
    setShowTemplatePicker(true);
    setSelectedTemplateIds(new Set());
    setTemplateSearch("");
    const { data } = await supabase
      .from("contact_templates")
      .select("id, name, firma, rolle, telefon, email")
      .order("name");
    setTemplates(data || []);
  };

  const toggleTemplate = (id: string) => {
    const next = new Set(selectedTemplateIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedTemplateIds(next);
  };

  const addSelectedTemplates = async () => {
    if (!projectId || selectedTemplateIds.size === 0) return;
    setAddingTemplates(true);
    const selected = templates.filter(t => selectedTemplateIds.has(t.id));
    const maxSort = contacts.reduce((m, c) => Math.max(m, (c as any).sort_order ?? 0), 0);
    const rows = selected.map((t, i) => ({
      project_id: projectId,
      name: t.name,
      firma: t.firma,
      rolle: t.rolle,
      telefon: t.telefon,
      email: t.email,
      phase: "beide",
      sort_order: maxSort + 1 + i,
    }));
    const { error } = await supabase.from("project_contacts").insert(rows);
    setAddingTemplates(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: `${rows.length} Kontakt${rows.length === 1 ? "" : "e"} aus Vorlage hinzugefügt` });
    setShowTemplatePicker(false);
    fetchContacts();
  };

  const fetchFileCounts = async () => {
    if (!projectId) return;

    const bucketMap: Record<string, string> = {
      plans: "project-plans",
      reports: "project-reports",
      photos: "project-photos",
      chef: "project-chef",
      polier: "project-polier",
    };

    const updatedCategories = await Promise.all(
      categories.map(async (category) => {
        if (category.type === "chef" && !isAdmin) {
          return { ...category, count: 0 };
        }
        if (category.type === "polier" && !isAdmin && !isVorarbeiter) {
          return { ...category, count: 0 };
        }

        const bucket = bucketMap[category.type];
        const { data } = await supabase
          .storage
          .from(bucket)
          .list(projectId);

        return {
          ...category,
          count: data?.length || 0,
        };
      })
    );

    setCategories(updatedCategories);
  };

  const handleQuickPhotoUpload = () => {
    navigate(`/projects/${projectId}/photos`);
  };

  const [downloading, setDownloading] = useState(false);
  const handleProjectZipDownload = async () => {
    if (!projectId || !isAdmin) return;
    setDownloading(true);
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const folder = zip.folder(projectName || "Projekt")!;

    const buckets = [
      { name: "Plaene_Auftraege", bucket: "project-plans" },
      { name: "Regieberichte", bucket: "project-reports" },
      { name: "Fotos", bucket: "project-photos" },
      { name: "Chefordner", bucket: "project-chef" },
      { name: "Polierordner", bucket: "project-polier" },
    ];

    for (const b of buckets) {
      const { data: files } = await supabase.storage.from(b.bucket).list(projectId);
      if (!files || files.length === 0) continue;
      const subFolder = folder.folder(b.name)!;
      for (const file of files) {
        const { data } = await supabase.storage.from(b.bucket).download(`${projectId}/${file.name}`);
        if (data) subFolder.file(file.name, data);
      }
    }

    // Kontakte als Excel
    if (contacts.length > 0) {
      const XLSX = await import("xlsx-js-style");
      const wsData = contacts.map(c => ({
        Name: c.name, Firma: c.firma || "", Rolle: c.rolle || "",
        Telefon: c.telefon || "", Email: c.email || "",
      }));
      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Kontakte");
      const excelBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      folder.file("Kontakte.xlsx", excelBuffer);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "Projekt"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
    toast({ title: "Download abgeschlossen" });
  };

  const visibleCategories = categories.filter((category) => {
    if (category.adminOnly && !isAdmin) return false;
    if (category.polierOnly && !isAdmin && !isVorarbeiter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <img
              src="/schafferhofer-logo.png"
              alt="Schafferhofer Bau"
              className="h-14 sm:h-20 w-auto max-w-[180px] sm:max-w-[240px] cursor-pointer hover:opacity-80 transition-opacity object-contain"
              onClick={() => navigate("/projects")}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold">{projectName}</h1>
            {isAdmin && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openEditDialog}>
                  <Pencil className="h-4 w-4" />
                  <span className="hidden sm:inline">Bearbeiten</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { fetchAccessData(); setShowAccessDialog(true); }}
                >
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Zugriff</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleProjectZipDownload}
                  disabled={downloading}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">{downloading ? "Lädt..." : "ZIP"}</span>
                </Button>
              </div>
            )}
          </div>
          {projectInfo && (projectInfo.adresse || projectInfo.bauherr || projectInfo.bauleiter || projectInfo.budget) ? (
            <div className="text-sm text-muted-foreground space-y-0.5">
              {projectInfo.adresse && (
                <p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectInfo.adresse + (projectInfo.plz ? `, ${projectInfo.plz}` : ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {projectInfo.adresse}{projectInfo.plz ? `, ${projectInfo.plz}` : ""}
                  </a>
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {projectInfo.bauherr && <span>Bauherr: <strong>{projectInfo.bauherr}</strong>{projectInfo.bauherr_kontakt ? ` (${projectInfo.bauherr_kontakt})` : ""}</span>}
                {projectInfo.bauleiter && <span>Bauleiter: <strong>{projectInfo.bauleiter}</strong></span>}
                {projectInfo.budget != null && <span>Budget: <strong>{new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(projectInfo.budget)}</strong></span>}
              </div>
              {(projectInfo.start_datum || projectInfo.end_datum) && (
                <p>Zeitraum: {projectInfo.start_datum ? new Date(projectInfo.start_datum).toLocaleDateString("de-AT") : "–"} – {projectInfo.end_datum ? new Date(projectInfo.end_datum).toLocaleDateString("de-AT") : "offen"}</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Dokumentation und Dateien</p>
          )}
        </div>

        {/* Kundendaten */}
        {projectInfo && (projectInfo.bauherr || projectInfo.kunde_telefon || projectInfo.kunde_email) && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Kundendaten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {projectInfo.bauherr && (
                <p><strong>{projectInfo.bauherr}</strong>{projectInfo.bauherr_kontakt ? ` · ${projectInfo.bauherr_kontakt}` : ""}</p>
              )}
              {projectInfo.adresse && (
                <p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectInfo.adresse + (projectInfo.plz ? `, ${projectInfo.plz}` : ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {projectInfo.adresse}{projectInfo.plz ? `, ${projectInfo.plz}` : ""}
                  </a>
                </p>
              )}
              <div className="flex flex-wrap gap-4">
                {projectInfo.kunde_telefon && (
                  <a href={`tel:${projectInfo.kunde_telefon}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {projectInfo.kunde_telefon}
                  </a>
                )}
                {projectInfo.kunde_email && (
                  <a href={`mailto:${projectInfo.kunde_email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Mail className="h-3.5 w-3.5" /> {projectInfo.kunde_email}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Projektkontakte — prominent oben */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Projektkontakte
                {contacts.length > 0 && <span className="text-sm font-normal text-muted-foreground">({contacts.length})</span>}
              </CardTitle>
              <div className="flex gap-1 flex-wrap">
                {contacts.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={exportContactsExcel} title="Excel-Export">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && (
                  <>
                    <label className="cursor-pointer">
                      <input type="file" accept=".xlsx,.xls" onChange={importContactsExcel} className="hidden" />
                      <Button size="sm" variant="ghost" type="button" onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }} title="Excel-Import (überschreibt alle)">
                        <Upload className="h-4 w-4" />
                      </Button>
                    </label>
                    <Button size="sm" variant="outline" onClick={openTemplatePicker} title="Kontakt aus Vorlage">
                      <Users className="h-4 w-4 mr-1" /> Vorlage
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowContactDialog(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Kontakt
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          {contacts.length > 0 ? (
            <CardContent className="pt-0 space-y-2">
              {contacts.slice(0, showAllContacts ? contacts.length : 2).map(c => (
                <div key={c.id} className="flex items-start gap-3 p-2 rounded-lg border text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{c.name}{c.firma && <span className="text-muted-foreground font-normal"> · {c.firma}</span>}</div>
                    {c.rolle && <div className="text-xs text-muted-foreground">{c.rolle} · {c.phase === "planungsphase" ? "Planungsphase" : c.phase === "beide" ? "Alle Phasen" : "Bauphase"}</div>}
                    <div className="flex flex-wrap gap-3 mt-1">
                      {c.telefon && (
                        <a href={`tel:${c.telefon}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone className="h-3 w-3" /> {c.telefon}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Mail className="h-3 w-3" /> {c.email}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyContact(c)} title="Kontakt kopieren">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportContactVCF(c)} title="Als VCF exportieren (WhatsApp/Kontakte)">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveContact(c.id, "up")} title="Nach oben">
                          <ArrowLeft className="h-3 w-3 rotate-90" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveContact(c.id, "down")} title="Nach unten">
                          <ArrowLeft className="h-3 w-3 -rotate-90" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContact(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteContact(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {contacts.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setShowAllContacts(!showAllContacts)}
                >
                  {showAllContacts ? "Weniger anzeigen" : `+ ${contacts.length - 2} weitere Kontakte anzeigen`}
                </Button>
              )}
            </CardContent>
          ) : (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">Noch keine Kontakte hinzugefügt</p>
            </CardContent>
          )}
        </Card>

        {/* Zusatzinformationen */}
        {projectInfo && (projectInfo.erreichbarkeit || projectInfo.besonderheiten || projectInfo.hinweise) && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Zusatzinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {projectInfo.erreichbarkeit && (
                <div>
                  <p className="font-medium text-muted-foreground text-xs">Erreichbarkeit</p>
                  <p>{projectInfo.erreichbarkeit}</p>
                </div>
              )}
              {projectInfo.besonderheiten && (
                <div>
                  <p className="font-medium text-muted-foreground text-xs">Besonderheiten</p>
                  <p>{projectInfo.besonderheiten}</p>
                </div>
              )}
              {projectInfo.hinweise && (
                <div>
                  <p className="font-medium text-muted-foreground text-xs">Hinweise zur Baustelle</p>
                  <p>{projectInfo.hinweise}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {/* 1. Projekt-Chat */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow border-primary/30 bg-primary/5"
            onClick={() => navigate(`/projects/${projectId}/chat`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-primary"><MessageCircle className="h-8 w-8" /></div>
              </div>
              <CardTitle className="text-xl">Projekt-Chat</CardTitle>
              <CardDescription>Nachrichten & Fotos mit dem Team austauschen</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">Chat oeffnen</Button>
            </CardContent>
          </Card>

          {/* 2. Plaene/Auftraege */}
          {visibleCategories.filter(c => c.type === "plans").map((category) => (
            <Card key={category.type} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/projects/${projectId}/${category.type}`)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">Plaene / Auftraege</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
            </Card>
          ))}

          {/* 3. Lieferscheine & Rechnungen */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/incoming-documents?project=${projectId}${!isAdmin ? "&capture=1" : ""}`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-primary"><FileText className="h-8 w-8" /></div>
              </div>
              <CardTitle className="text-xl">Lieferscheine & Rechnungen</CardTitle>
              <CardDescription>Lieferscheine und Rechnungen verwalten</CardDescription>
            </CardHeader>
            <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
          </Card>

          {/* 4. Berichte (Tages-, Regie-, Zwischenberichte) */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/daily-reports?project=${projectId}`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-primary"><FileText className="h-8 w-8" /></div>
                <div className="text-2xl font-bold">{dailyReportCount}</div>
              </div>
              <CardTitle className="text-xl">Berichte</CardTitle>
              <CardDescription>Tages-, Regie- und Zwischenberichte</CardDescription>
            </CardHeader>
            <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
          </Card>

          {/* Regieberichte-Karte entfernt - ersetzt durch "Berichte" oben */}

          {/* 5. Fotos */}
          {visibleCategories.filter(c => c.type === "photos").map((category) => (
            <Card key={category.type} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/projects/${projectId}/${category.type}`)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
            </Card>
          ))}

          {/* 6. Bestellungen */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/bestellungen?project=${projectId}`)}>
            <CardHeader>
              <div className="text-primary"><FileText className="h-8 w-8" /></div>
              <CardTitle className="text-xl">Bestellungen</CardTitle>
              <CardDescription>Material bestellen und verwalten</CardDescription>
            </CardHeader>
            <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
          </Card>

          {/* 7. Unterweisungen */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/safety-evaluations?project=${projectId}`)}>
            <CardHeader>
              <div className="text-primary"><Shield className="h-8 w-8" /></div>
              <CardTitle className="text-xl">Unterweisungen</CardTitle>
              <CardDescription>Sicherheits- und Geräteunterweisungen</CardDescription>
            </CardHeader>
            <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
          </Card>

          {/* 8. Polierordner (Vorarbeiter + Admin) */}
          {visibleCategories.filter(c => c.type === "polier").map((category) => (
            <Card key={category.type} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/projects/${projectId}/${category.type}`)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
            </Card>
          ))}

          {/* 7. Chefordner (Admin only) */}
          {visibleCategories.filter(c => c.type === "chef").map((category) => (
            <Card key={category.type} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/projects/${projectId}/${category.type}`)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" className="w-full">Öffnen</Button></CardContent>
            </Card>
          ))}
        </div>

        {/* Floating Action Button für Fotos */}
        <Button
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={handleQuickPhotoUpload}
        >
          <ImagePlus className="h-6 w-6" />
        </Button>
      </main>

      {/* Contact Dialog */}
      <Dialog open={showContactDialog} onOpenChange={(open) => { if (!open) resetContactDialog(); else setShowContactDialog(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Kontakt bearbeiten" : "Kontakt hinzufügen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={contactForm.name} onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label>Firma</Label>
                <Input value={contactForm.firma} onChange={(e) => setContactForm(f => ({ ...f, firma: e.target.value }))} className="h-10" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Rolle</Label>
              <Input placeholder="z.B. Zimmerer, Dachdecker, Energieversorger" value={contactForm.rolle} onChange={(e) => setContactForm(f => ({ ...f, rolle: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Telefon</Label>
                <Input type="tel" value={contactForm.telefon} onChange={(e) => setContactForm(f => ({ ...f, telefon: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label>E-Mail</Label>
                <Input type="email" value={contactForm.email} onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))} className="h-10" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Phase</Label>
              <Select value={contactForm.phase} onValueChange={(v) => setContactForm(f => ({ ...f, phase: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planungsphase">Planungsphase</SelectItem>
                  <SelectItem value="bauphase">Bauphase</SelectItem>
                  <SelectItem value="beide">Beide Phasen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 h-10" onClick={handleSaveContact} disabled={!contactForm.name.trim()}>
                {editingContact ? "Aktualisieren" : "Speichern"}
              </Button>
              <Button className="flex-1 h-10" variant="outline" onClick={resetContactDialog}>Abbrechen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Picker Dialog */}
      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Kontakt aus Vorlage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 flex-1 overflow-hidden flex flex-col">
            <Input
              placeholder="Suchen (Name, Firma, Rolle)..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="h-10"
            />
            <div className="flex-1 overflow-y-auto border rounded-lg">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Keine Vorlagen vorhanden. Admin kann unter Administration → Kontakt-Vorlagen welche anlegen.
                </p>
              ) : (
                (() => {
                  const term = templateSearch.toLowerCase().trim();
                  const filtered = term
                    ? templates.filter(t =>
                        [t.name, t.firma, t.rolle, t.telefon].some(v => (v || "").toLowerCase().includes(term))
                      )
                    : templates;
                  if (filtered.length === 0) {
                    return <p className="text-sm text-muted-foreground p-4 text-center">Keine Treffer</p>;
                  }
                  return filtered.map(t => (
                    <label key={t.id} className="flex items-start gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={selectedTemplateIds.has(t.id)}
                        onCheckedChange={() => toggleTemplate(t.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="font-medium">
                          {t.name}
                          {t.firma && <span className="text-muted-foreground font-normal"> · {t.firma}</span>}
                        </div>
                        {t.rolle && <div className="text-xs text-muted-foreground">{t.rolle}</div>}
                        <div className="flex flex-wrap gap-3 mt-0.5">
                          {t.telefon && <span className="text-xs text-muted-foreground">{t.telefon}</span>}
                          {t.email && <span className="text-xs text-muted-foreground">{t.email}</span>}
                        </div>
                      </div>
                    </label>
                  ));
                })()
              )}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={addSelectedTemplates}
                disabled={addingTemplates || selectedTemplateIds.size === 0}
              >
                {addingTemplates ? "Hinzufügen..." : `${selectedTemplateIds.size} hinzufügen`}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowTemplatePicker(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Access Management Dialog */}
      <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Projektzugriff verwalten
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            <p className="text-sm text-muted-foreground mb-3">
              Wähle die Mitarbeiter aus, die Zugriff auf dieses Projekt haben sollen.
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {allEmployees.map(emp => (
                <label
                  key={emp.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={accessUserIds.has(emp.user_id!)}
                    onCheckedChange={() => handleToggleAccess(emp.user_id!)}
                  />
                  <span className="text-sm">{emp.name}</span>
                </label>
              ))}
              {allEmployees.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">Keine Mitarbeiter gefunden</p>
              )}
            </div>
            <div className="flex gap-2 pt-3">
              <Button className="flex-1" onClick={handleSaveAccess} disabled={savingAccess}>
                {savingAccess ? "Speichert..." : `Speichern (${accessUserIds.size})`}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setShowAccessDialog(false)}>Abbrechen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Projekt bearbeiten
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Projektname *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <VoiceAIInput
                multiline
                rows={2}
                context="default"
                value={editForm.beschreibung}
                onChange={(v) => setEditForm(f => ({ ...f, beschreibung: v }))}
              />
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Adresse & Kunde</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label>Adresse</Label>
                  <Input value={editForm.adresse} onChange={(e) => setEditForm(f => ({ ...f, adresse: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label>PLZ</Label>
                  <Input value={editForm.plz} onChange={(e) => setEditForm(f => ({ ...f, plz: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Bauherr</Label>
                  <Input value={editForm.bauherr} onChange={(e) => setEditForm(f => ({ ...f, bauherr: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Bauherr Kontakt</Label>
                  <Input value={editForm.bauherr_kontakt} onChange={(e) => setEditForm(f => ({ ...f, bauherr_kontakt: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Bauherr 2</Label>
                  <Input value={editForm.bauherr2} onChange={(e) => setEditForm(f => ({ ...f, bauherr2: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Bauherr 2 Kontakt</Label>
                  <Input value={editForm.bauherr2_kontakt} onChange={(e) => setEditForm(f => ({ ...f, bauherr2_kontakt: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Baustellenart</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editForm.baustellenart}
                    onChange={(e) => setEditForm(f => ({ ...f, baustellenart: e.target.value }))}
                  >
                    <option value="">-- Auswählen --</option>
                    <option value="regie">Regie</option>
                    <option value="pauschale">Pauschale</option>
                  </select>
                </div>
                <div className="space-y-1 flex items-center gap-3 pt-5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={editForm.anfahrt_ueber_100km}
                    onChange={(e) => setEditForm(f => ({ ...f, anfahrt_ueber_100km: e.target.checked }))}
                    id="anfahrt100km"
                  />
                  <Label htmlFor="anfahrt100km">&gt;100km Anfahrt</Label>
                </div>
                <div className="space-y-1">
                  <Label>Telefon</Label>
                  <Input type="tel" value={editForm.kunde_telefon} onChange={(e) => setEditForm(f => ({ ...f, kunde_telefon: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>E-Mail</Label>
                  <Input type="email" value={editForm.kunde_email} onChange={(e) => setEditForm(f => ({ ...f, kunde_email: e.target.value }))} className="h-10" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Projektleitung & Zeitraum</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bauleiter</Label>
                  <Input value={editForm.bauleiter} onChange={(e) => setEditForm(f => ({ ...f, bauleiter: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Budget</Label>
                  <Input type="number" value={editForm.budget} onChange={(e) => setEditForm(f => ({ ...f, budget: e.target.value }))} className="h-10" placeholder="in EUR" />
                </div>
                <div className="space-y-1">
                  <Label>Startdatum</Label>
                  <Input type="date" value={editForm.start_datum} onChange={(e) => setEditForm(f => ({ ...f, start_datum: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label>Enddatum</Label>
                  <Input type="date" value={editForm.end_datum} onChange={(e) => setEditForm(f => ({ ...f, end_datum: e.target.value }))} className="h-10" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Zusatzinformationen</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Erreichbarkeit</Label>
                  <VoiceAIInput
                    context="notiz"
                    value={editForm.erreichbarkeit}
                    onChange={(v) => setEditForm(f => ({ ...f, erreichbarkeit: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Besonderheiten</Label>
                  <VoiceAIInput
                    multiline
                    rows={2}
                    context="anmerkung"
                    value={editForm.besonderheiten}
                    onChange={(v) => setEditForm(f => ({ ...f, besonderheiten: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Hinweise zur Baustelle</Label>
                  <VoiceAIInput
                    multiline
                    rows={2}
                    context="anmerkung"
                    value={editForm.hinweise}
                    onChange={(v) => setEditForm(f => ({ ...f, hinweise: v }))}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Projektkontakte</p>
              <p className="text-xs text-muted-foreground mb-2">
                Kontakte werden direkt auf der Projektseite verwaltet (hinzufügen, bearbeiten, löschen, sortieren, aus Vorlage übernehmen, Excel-Import/Export).
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowEditDialog(false); setTimeout(() => setShowContactDialog(true), 150); }}
              >
                <Plus className="h-4 w-4 mr-1" /> Kontakt hinzufügen
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => { setShowEditDialog(false); setTimeout(() => openTemplatePicker(), 150); }}
              >
                <Users className="h-4 w-4 mr-1" /> Aus Vorlage
              </Button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSaveEdit} disabled={savingEdit || !editForm.name.trim()}>
                {savingEdit ? "Speichert..." : "Speichern"}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setShowEditDialog(false)}>Abbrechen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectOverview;
