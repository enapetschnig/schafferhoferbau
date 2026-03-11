import { useEffect, useState, useRef } from "react";
import { ArrowLeft, FolderOpen, Plus, FileText, Image, Lock, Search, Upload, Camera, Trash2, ChevronDown, Home, MapPin, Star, X, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickUploadDialog } from "@/components/QuickUploadDialog";
import { MobilePhotoCapture } from "@/components/MobilePhotoCapture";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SafetyEmployeeSelector } from "@/components/safety/SafetyEmployeeSelector";

type Project = {
  id: string;
  name: string;
  beschreibung: string | null;
  adresse: string | null;
  plz: string | null;
  bauherr: string | null;
  bauherr_kontakt: string | null;
  bauleiter: string | null;
  budget: number | null;
  start_datum: string | null;
  end_datum: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  fileCount?: {
    plans: number;
    reports: number;
    photos: number;
    chef: number;
  };
};

const Projects = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newProject, setNewProject] = useState({
    name: "",
    adresse: "",
    kunde_telefon: "",
    kunde_email: "",
    erreichbarkeit: "",
    besonderheiten: "",
    hinweise: "",
  });
  const [newContacts, setNewContacts] = useState<{ rolle: string; name: string; telefon: string; email: string }[]>([]);
  const [quickUploadProject, setQuickUploadProject] = useState<{
    projectId: string;
    documentType: 'photos' | 'plans' | 'reports';
  } | null>(null);
  const [projectToClose, setProjectToClose] = useState<{id: string, name: string} | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{id: string, name: string} | null>(null);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [closedProjectsOpen, setClosedProjectsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [accessEmployeeIds, setAccessEmployeeIds] = useState<string[]>([]);

  const [adminChecked, setAdminChecked] = useState(false);

  useEffect(() => {
    const init = async () => {
      await checkAdminStatus();
      setAdminChecked(true);
    };
    init();
    fetchFavorites();

    // Realtime subscription
    const channel = supabase
      .channel('projects-list-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (adminChecked) {
      fetchProjects();
    }
  }, [adminChecked]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setCurrentUserId(user.id);

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    setIsAdmin(data?.role === "administrator");
  };

  const fetchFavorites = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("project_favorites")
      .select("project_id")
      .eq("user_id", user.id);
    if (data) setFavoriteIds(new Set(data.map(f => f.project_id)));
  };

  const toggleFavorite = async (projectId: string) => {
    if (!currentUserId) return;
    if (favoriteIds.has(projectId)) {
      await supabase.from("project_favorites").delete().eq("user_id", currentUserId).eq("project_id", projectId);
      setFavoriteIds(prev => { const next = new Set(prev); next.delete(projectId); return next; });
    } else {
      if (favoriteIds.size >= 3) {
        toast({ variant: "destructive", title: "Maximum erreicht", description: "Du kannst max. 3 Favoriten haben." });
        return;
      }
      await supabase.from("project_favorites").insert({ user_id: currentUserId, project_id: projectId });
      setFavoriteIds(prev => new Set(prev).add(projectId));
    }
  };

  const fetchProjects = async () => {
    let projectData: any[] = [];

    if (isAdmin) {
      // Admins see all projects
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { setLoading(false); return; }
      projectData = data || [];
    } else {
      // Non-admins: only projects they have access to
      const { data: accessData } = await supabase
        .from("project_access")
        .select("project_id")
        .eq("user_id", currentUserId!);
      const accessIds = (accessData || []).map(a => (a as any).project_id);
      if (accessIds.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .in("id", accessIds)
        .order("created_at", { ascending: false });
      if (error) { setLoading(false); return; }
      projectData = data || [];
    }

    const data = projectData;
    const error = null;

    // Fetch file counts for each project
    const projectsWithCounts = await Promise.all(
      (data || []).map(async (project) => {
        const [plans, reports, photos, chef] = await Promise.all([
          getFileCount(project.id, 'project-plans'),
          getFileCount(project.id, 'project-reports'),
          getFileCount(project.id, 'project-photos'),
          getFileCount(project.id, 'project-chef'),
        ]);

        return {
          ...project,
          fileCount: { plans, reports, photos, chef },
        };
      })
    );

    setProjects(projectsWithCounts);
    setLoading(false);
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Projektname ist erforderlich",
      });
      return;
    }

    const { data: inserted, error } = await supabase
      .from("projects")
      .insert({
        name: newProject.name.trim(),
        adresse: newProject.adresse.trim() || null,
        kunde_telefon: newProject.kunde_telefon.trim() || null,
        kunde_email: newProject.kunde_email.trim() || null,
        erreichbarkeit: newProject.erreichbarkeit.trim() || null,
        besonderheiten: newProject.besonderheiten.trim() || null,
        hinweise: newProject.hinweise.trim() || null,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Projekt konnte nicht erstellt werden",
      });
    } else {
      // Save contacts if any
      const validContacts = newContacts.filter(c => c.name.trim() || c.rolle.trim());
      if (validContacts.length > 0) {
        await supabase.from("project_contacts").insert(
          validContacts.map(c => ({
            project_id: inserted.id,
            name: c.name.trim() || c.rolle.trim(),
            rolle: c.rolle.trim() || null,
            telefon: c.telefon.trim() || null,
            email: c.email.trim() || null,
          }))
        );
      }

      // Save project access for selected employees
      if (accessEmployeeIds.length > 0) {
        await supabase.from("project_access").insert(
          accessEmployeeIds.map(uid => ({
            project_id: inserted.id,
            user_id: uid,
            granted_by: currentUserId,
          }))
        );
      }

      toast({
        title: "Erfolg",
        description: "Projekt wurde erstellt",
      });
      setNewProject({ name: "", adresse: "", kunde_telefon: "", kunde_email: "", erreichbarkeit: "", besonderheiten: "", hinweise: "" });
      setNewContacts([]);
      setAccessEmployeeIds([]);
      setShowNewDialog(false);
      fetchProjects();
    }
  };

  const handleToggleProjectStatus = async (projectId: string, currentStatus: string, projectName: string) => {
    if (togglingStatus) return; // Prevent double-click
    
    // Wenn Projekt geschlossen wird → Bestätigung anfordern
    if (currentStatus === 'aktiv') {
      setProjectToClose({ id: projectId, name: projectName });
      return;
    }
    // Wiedereröffnen ohne Bestätigung
    await updateProjectStatus(projectId, 'aktiv', projectName);
  };

  const updateProjectStatus = async (projectId: string, newStatus: string, projectName: string) => {
    if (togglingStatus) return;
    setTogglingStatus(projectId);

    const { error } = await supabase
      .from("projects")
      .update({ status: newStatus })
      .eq("id", projectId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Projekt konnte nicht aktualisiert werden",
      });
      setTogglingStatus(null);
    } else {
      toast({
        title: newStatus === 'aktiv' ? 'Projekt wiedereröffnet' : 'Projekt geschlossen',
        description: `${projectName} wurde ${newStatus === 'aktiv' ? 'wiedereröffnet' : 'geschlossen'}`,
      });
      fetchProjects();
      setTogglingStatus(null);
    }
    setProjectToClose(null);
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete || deleting) return;
    setDeleting(true);

    const { id, name } = projectToDelete;
    
    try {
      // Delete all files from storage buckets
      const buckets = ['project-plans', 'project-reports', 'project-materials', 'project-photos'];
      
      for (const bucket of buckets) {
        const { data: files } = await supabase.storage
          .from(bucket)
          .list(id);
        
        if (files && files.length > 0) {
          const filePaths = files.map(file => `${id}/${file.name}`);
          await supabase.storage
            .from(bucket)
            .remove(filePaths);
        }
      }

      // Delete documents entries
      await supabase
        .from('documents')
        .delete()
        .eq('project_id', id);

      // Set project_id to null in time_entries and reports
      await supabase
        .from('time_entries')
        .update({ project_id: null })
        .eq('project_id', id);

      await supabase
        .from('reports')
        .update({ project_id: null })
        .eq('project_id', id);

      // Finally delete the project
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: `Projekt "${name}" wurde erfolgreich gelöscht`,
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Fehler",
        description: "Projekt konnte nicht vollständig gelöscht werden",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setProjectToDelete(null);
    }
  };

  const handlePhotoCapture = async (file: File) => {
    if (!quickUploadProject) {
      throw new Error("Kein Projekt ausgewählt");
    }

    const timestamp = Date.now();
    const filePath = `${quickUploadProject.projectId}/${timestamp}_${file.name}`;
    
    const { error: uploadError } = await supabase
      .storage
      .from('project-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase
      .storage
      .from('project-photos')
      .getPublicUrl(filePath);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht angemeldet");

    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        project_id: quickUploadProject.projectId,
        typ: 'photos',
        name: file.name,
        file_url: publicUrl,
        beschreibung: 'Foto hochgeladen',
      });

    if (dbError) throw dbError;

    setQuickUploadProject(null);
    fetchProjects();
  };

  const getFileCount = async (projectId: string, bucketName: string): Promise<number> => {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(projectId);

    if (error) {
      console.error(`Error fetching file count from ${bucketName}:`, error);
      return 0;
    }

    return data?.length || 0;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffMins < 1440) return `vor ${Math.floor(diffMins / 60)} Std.`;
    if (diffMins < 2880) return "Gestern";
    return date.toLocaleDateString("de-DE");
  };

  const exportToExcel = () => {
    const data = projects.map((p) => ({
      Name: p.name,
      Status: p.status === "aktiv" ? "Aktiv" : "Geschlossen",
      Bauherr: p.bauherr || "",
      Adresse: p.adresse || "",
      PLZ: p.plz || "",
      Bauleiter: p.bauleiter || "",
      "Start": p.start_datum || "",
      "Ende": p.end_datum || "",
      Budget: p.budget ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projekte");
    XLSX.writeFile(wb, `Projekte_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <Home className="h-5 w-5" />
              </Button>
              <img 
                src="/schafferhofer-logo.svg"
                alt="Schafferhofer Bau"
                className="h-10 w-10 sm:h-14 sm:w-14 cursor-pointer hover:opacity-80 transition-opacity object-contain"
                onClick={() => navigate("/")}
              />
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && projects.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1">
                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
              )}
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              {isAdmin && (
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1 sm:gap-2">
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Neues Projekt</span>
                  <span className="sm:hidden">Neu</span>
                </Button>
              </DialogTrigger>
              )}
              <DialogContent className="max-w-sm sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Neues Projekt erstellen</DialogTitle>
                  <DialogDescription>Bauvorhaben hinzufügen</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Kundendaten */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Kundendaten</h3>
                    <div className="space-y-2">
                      <Label htmlFor="name">Projektname *</Label>
                      <Input
                        id="name"
                        value={newProject.name}
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                        placeholder="z.B. Einfamilienhaus Müller"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adresse">Adresse</Label>
                      <Input
                        id="adresse"
                        value={newProject.adresse}
                        onChange={(e) => setNewProject({ ...newProject, adresse: e.target.value })}
                        placeholder="Straße und Hausnummer, PLZ Ort"
                      />
                      <p className="text-xs text-muted-foreground">
                        z.B. Hauptstraße 12, 8010 Graz
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Telefon</Label>
                        <Input
                          value={newProject.kunde_telefon}
                          onChange={(e) => setNewProject({ ...newProject, kunde_telefon: e.target.value })}
                          placeholder="Tel. des Kunden"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>E-Mail</Label>
                        <Input
                          type="email"
                          value={newProject.kunde_email}
                          onChange={(e) => setNewProject({ ...newProject, kunde_email: e.target.value })}
                          placeholder="E-Mail des Kunden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Projektkontakte */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Wichtige Projektkontakte</h3>
                    {newContacts.map((contact, idx) => (
                      <div key={idx} className="rounded-lg border p-3 space-y-2 relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-7 w-7 p-0"
                          onClick={() => setNewContacts(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Bezeichnung</Label>
                            <Input
                              value={contact.rolle}
                              onChange={(e) => {
                                const updated = [...newContacts];
                                updated[idx] = { ...updated[idx], rolle: e.target.value };
                                setNewContacts(updated);
                              }}
                              placeholder="z.B. Zimmerer"
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={contact.name}
                              onChange={(e) => {
                                const updated = [...newContacts];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setNewContacts(updated);
                              }}
                              placeholder="Name"
                              className="h-9"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Telefon</Label>
                            <Input
                              value={contact.telefon}
                              onChange={(e) => {
                                const updated = [...newContacts];
                                updated[idx] = { ...updated[idx], telefon: e.target.value };
                                setNewContacts(updated);
                              }}
                              placeholder="Telefonnummer"
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">E-Mail</Label>
                            <Input
                              value={contact.email}
                              onChange={(e) => {
                                const updated = [...newContacts];
                                updated[idx] = { ...updated[idx], email: e.target.value };
                                setNewContacts(updated);
                              }}
                              placeholder="E-Mail"
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => setNewContacts(prev => [...prev, { rolle: "", name: "", telefon: "", email: "" }])}
                    >
                      <Plus className="h-4 w-4" />
                      Kontakt hinzufügen
                    </Button>
                  </div>

                  {/* Zusatzinformationen */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Zusatzinformationen</h3>
                    <div className="space-y-2">
                      <Label>Erreichbarkeit</Label>
                      <Input
                        value={newProject.erreichbarkeit}
                        onChange={(e) => setNewProject({ ...newProject, erreichbarkeit: e.target.value })}
                        placeholder="z.B. Mo-Fr 8-16 Uhr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Besonderheiten</Label>
                      <Textarea
                        value={newProject.besonderheiten}
                        onChange={(e) => setNewProject({ ...newProject, besonderheiten: e.target.value })}
                        placeholder="Besonderheiten des Projekts..."
                        className="min-h-16"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hinweise zur Baustelle</Label>
                      <Textarea
                        value={newProject.hinweise}
                        onChange={(e) => setNewProject({ ...newProject, hinweise: e.target.value })}
                        placeholder="Zufahrt, Parkmöglichkeiten, etc."
                        className="min-h-16"
                      />
                    </div>
                  </div>

                  {/* Mitarbeiterzugriff */}
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Mitarbeiterzugriff</Label>
                    <p className="text-xs text-muted-foreground">Welche Mitarbeiter sollen Zugriff auf dieses Projekt haben?</p>
                    <SafetyEmployeeSelector
                      selectedIds={accessEmployeeIds}
                      onChange={setAccessEmployeeIds}
                    />
                  </div>

                  <Button onClick={handleCreateProject} className="w-full">
                    Projekt erstellen
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-6xl">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Projekte</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Bauvorhaben verwalten und dokumentieren
          </p>
        </div>

        {/* Aktive Projekte Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-semibold">Aktive Projekte</h2>
            <Badge variant="secondary">
              {projects.filter(p => p.status === 'aktiv').length}
            </Badge>
          </div>

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Aktive Projekte durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 lg:gap-6">
            {projects
              .filter((project) => {
                if (project.status !== 'aktiv') return false;
                const query = searchQuery.toLowerCase();
                return (
                  project.name.toLowerCase().includes(query) ||
                  project.adresse?.toLowerCase().includes(query) ||
                  project.beschreibung?.toLowerCase().includes(query) ||
                  project.bauherr?.toLowerCase().includes(query) ||
                  project.bauleiter?.toLowerCase().includes(query)
                );
              })
              .sort((a, b) => {
                const aFav = favoriteIds.has(a.id) ? 0 : 1;
                const bFav = favoriteIds.has(b.id) ? 0 : 1;
                return aFav - bFav;
              })
              .map((project) => (
            <Card
              key={project.id}
              className={`border-2 hover:shadow-lg transition-all cursor-pointer ${favoriteIds.has(project.id) ? "border-red-500 bg-red-50 dark:bg-red-950/20" : ""}`}
              onClick={() => navigate(`/projects/${project.id}`)}

            >
              <CardHeader className={`pb-3 sm:pb-4 ${favoriteIds.has(project.id) ? "bg-red-100/50 dark:bg-red-950/30" : "bg-primary/5"}`}>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                  <div className="flex gap-2 sm:gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {project.status === "geschlossen" ? (
                        <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
                      ) : (
                        <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-xl truncate">{project.name}</CardTitle>
                      {project.adresse && (
                        <CardDescription className="text-xs sm:text-sm">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.adresse)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3 shrink-0" />
                            {project.adresse}
                          </a>
                        </CardDescription>
                      )}
                      {(project.bauherr || project.bauleiter) && (
                        <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                          {project.bauherr && <span>Bauherr: {project.bauherr}</span>}
                          {project.bauleiter && <span>Bauleiter: {project.bauleiter}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(project.id); }}
                      className="p-1 hover:scale-110 transition-transform"
                      title={favoriteIds.has(project.id) ? "Favorit entfernen" : "Als Favorit markieren"}
                    >
                      <Star className={`h-5 w-5 ${favoriteIds.has(project.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                    </button>
                    <Badge
                      variant={project.status === "aktiv" ? "default" : "secondary"}
                      className="whitespace-nowrap"
                    >
                      {project.status === "aktiv" ? "Aktiv" : "Geschlossen"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6">
                {project.beschreibung && (
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4 line-clamp-2">
                    {project.beschreibung}
                  </p>
                )}
                
                <div className={`grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-2 sm:gap-3 mb-4`}>
                  <div className="flex flex-col items-center gap-1 p-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-xs font-medium">Pläne</span>
                    <span className="text-xs text-muted-foreground">
                      {project.fileCount?.plans || 0}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-xs font-medium">Berichte</span>
                    <span className="text-xs text-muted-foreground">
                      {project.fileCount?.reports || 0}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-2">
                    <Image className="w-5 h-5 text-primary" />
                    <span className="text-xs font-medium">Fotos</span>
                    <span className="text-xs text-muted-foreground">
                      {project.fileCount?.photos || 0}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-col items-center gap-1 p-2">
                      <Lock className="w-5 h-5 text-primary" />
                      <span className="text-xs font-medium">Chef</span>
                      <span className="text-xs text-muted-foreground">
                        {project.fileCount?.chef || 0}
                      </span>
                    </div>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 mt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Upload className="w-4 h-4" />
                      + Dateien hochladen
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-background z-50">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setQuickUploadProject({ projectId: project.id, documentType: 'photos' });
                      setShowCameraDialog(true);
                    }}>
                      <Camera className="w-4 h-4 mr-2" />
                      📸 Foto aufnehmen
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setQuickUploadProject({ projectId: project.id, documentType: 'photos' });
                    }}>
                      <Camera className="w-4 h-4 mr-2" />
                      📷 Fotos hochladen
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setQuickUploadProject({ projectId: project.id, documentType: 'plans' });
                    }}>
                      <FileText className="w-4 h-4 mr-2" />
                      📋 Pläne hochladen
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setQuickUploadProject({ projectId: project.id, documentType: 'reports' });
                    }}>
                      <FileText className="w-4 h-4 mr-2" />
                      📄 Regieberichte hochladen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t mt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs text-muted-foreground">
                    Aktualisiert: {formatDate(project.updated_at)}
                  </p>
                  {isAdmin && (
                    <Button
                      variant={project.status === 'aktiv' ? 'ghost' : 'default'}
                      size="sm"
                      className="text-xs self-end sm:self-auto"
                      onClick={() => handleToggleProjectStatus(project.id, project.status, project.name)}
                    >
                      {project.status === 'aktiv' ? 'Projekt schließen' : 'Projekt wiedereröffnen'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {projects.filter(p => p.status === 'aktiv').length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine aktiven Projekte</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {isAdmin ? "Erstelle dein erstes Projekt" : "Du hast noch keinen Zugriff auf Projekte"}
                </p>
                {isAdmin && (
                  <Button onClick={() => setShowNewDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Neues Projekt
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          </div>
        </div>

        {/* Geschlossene Projekte Section */}
        {projects.filter(p => p.status === 'geschlossen').length > 0 && (
          <Collapsible open={closedProjectsOpen} onOpenChange={setClosedProjectsOpen}>
            <div className="mb-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">Geschlossene Projekte</h2>
                    <Badge variant="secondary">
                      {projects.filter(p => p.status === 'geschlossen').length}
                    </Badge>
                  </div>
                  <ChevronDown className={`h-5 w-5 transition-transform ${closedProjectsOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <div className="grid gap-3 sm:gap-4 lg:gap-6">
                {projects
                  .filter((project) => project.status === 'geschlossen')
                  .map((project) => (
                  <Card 
                    key={project.id} 
                    className="border-2 hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <CardHeader className="bg-primary/5 pb-3 sm:pb-4">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                        <div className="flex gap-2 sm:gap-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-xl truncate">{project.name}</CardTitle>
                            {project.adresse && (
                              <CardDescription className="text-xs sm:text-sm">{project.adresse}</CardDescription>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className="self-start sm:self-center whitespace-nowrap">
                          Geschlossen
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 sm:pt-6">
                      {project.beschreibung && (
                        <p className="text-xs sm:text-sm text-muted-foreground mb-4 line-clamp-2">
                          {project.beschreibung}
                        </p>
                      )}
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
                        <div className="flex flex-col items-center gap-1 p-2">
                          <FileText className="w-5 h-5 text-primary" />
                          <span className="text-xs font-medium">Pläne</span>
                          <span className="text-xs text-muted-foreground">
                            {project.fileCount?.plans || 0}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-1 p-2">
                          <FileText className="w-5 h-5 text-primary" />
                          <span className="text-xs font-medium">Berichte</span>
                          <span className="text-xs text-muted-foreground">
                            {project.fileCount?.reports || 0}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-1 p-2">
                          <Image className="w-5 h-5 text-primary" />
                          <span className="text-xs font-medium">Fotos</span>
                          <span className="text-xs text-muted-foreground">
                            {project.fileCount?.photos || 0}
                          </span>
                        </div>
                      </div>

                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t mt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-xs text-muted-foreground">
                          Aktualisiert: {formatDate(project.updated_at)}
                        </p>
                        {isAdmin && (
                          <div className="flex gap-2 self-end sm:self-auto">
                            <Button
                              variant="default"
                              size="sm"
                              className="text-xs"
                              onClick={() => handleToggleProjectStatus(project.id, project.status, project.name)}
                              disabled={togglingStatus === project.id}
                            >
                              {togglingStatus === project.id ? 'Wird geöffnet...' : 'Wiedereröffnen'}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="text-xs"
                              onClick={() => setProjectToDelete({ id: project.id, name: project.name })}
                              disabled={deleting}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              {deleting ? 'Wird gelöscht...' : 'Löschen'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
          </CollapsibleContent>
        </Collapsible>
        )}
      </main>

      {/* Quick Upload Dialog - Only show when NOT in camera mode */}
      {quickUploadProject && !showCameraDialog && (
        <QuickUploadDialog
          projectId={quickUploadProject.projectId}
          documentType={quickUploadProject.documentType}
          open={!!quickUploadProject}
          onClose={() => setQuickUploadProject(null)}
          onSuccess={() => {
            fetchProjects();
            setQuickUploadProject(null);
          }}
        />
      )}

      {/* Mobile Photo Capture Dialog */}
      <MobilePhotoCapture
        open={showCameraDialog}
        onClose={() => {
          setShowCameraDialog(false);
          setQuickUploadProject(null);
        }}
        onPhotoCapture={handlePhotoCapture}
      />

      {/* AlertDialog für Projekt schließen */}
      <AlertDialog open={!!projectToClose} onOpenChange={(open) => !open && setProjectToClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt schließen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bist du sicher, dass du das Projekt <strong>{projectToClose?.name}</strong> schließen möchtest?
              <br /><br />
              Das Projekt wird als "Geschlossen" markiert und kann später wieder geöffnet werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglingStatus !== null}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => projectToClose && updateProjectStatus(projectToClose.id, 'geschlossen', projectToClose.name)}
              disabled={togglingStatus !== null}
            >
              {togglingStatus ? 'Wird geschlossen...' : 'Ja, Projekt schließen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog für Projekt löschen */}
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bist du sicher, dass du das Projekt <strong>{projectToDelete?.name}</strong> unwiderruflich löschen möchtest?
              <br /><br />
              <span className="text-destructive font-semibold">Alle zugehörigen Dateien, Dokumente und Zuweisungen werden ebenfalls gelöscht.</span>
              <br /><br />
              Diese Aktion kann nicht rückgängig gemacht werden!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? 'Wird gelöscht...' : 'Ja, endgültig löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Projects;
