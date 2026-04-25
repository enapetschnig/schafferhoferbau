import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Upload, Trash2, Download, Plus, Pencil, ExternalLink, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type DocFile = { name: string; id: string; created_at: string };
type Category = { id: string; key: string; label: string; sort_order: number };
type LibLink = { id: string; category_key: string; title: string; url: string };

export default function DocumentLibrary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [files, setFiles] = useState<Record<string, DocFile[]>>({});
  const [links, setLinks] = useState<LibLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Category editing
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [catForm, setCatForm] = useState({ key: "", label: "" });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Link editing
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkForm, setLinkForm] = useState({ title: "", url: "" });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    setIsAdmin(roleData?.role === "administrator");

    await fetchCategories();
    await fetchLinks();
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("document_library_categories")
      .select("*")
      .order("sort_order");
    if (data && data.length > 0) {
      setCategories(data as Category[]);
      if (!activeTab) setActiveTab(data[0].key);
      await fetchAllFiles(data as Category[]);
    }
    setLoading(false);
  };

  const fetchLinks = async () => {
    const { data } = await supabase.from("document_library_links").select("*").order("sort_order");
    if (data) setLinks(data as LibLink[]);
  };

  const fetchAllFiles = async (cats: Category[]) => {
    const result: Record<string, DocFile[]> = {};
    await Promise.all(
      cats.map(async (cat) => {
        const { data } = await supabase.storage.from("document-library").list(cat.key, {
          sortBy: { column: "name", order: "asc" },
        });
        result[cat.key] = (data || [])
          .filter(f => f.name !== ".emptyFolderPlaceholder")
          .map(f => ({ name: f.name, id: f.id || f.name, created_at: f.created_at || "" }));
      })
    );
    setFiles(result);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${activeTab}/${file.name}`;
    const { error } = await supabase.storage.from("document-library").upload(path, file, { upsert: true });
    if (error) toast({ variant: "destructive", title: "Fehler", description: error.message });
    else { toast({ title: "Hochgeladen", description: file.name }); fetchAllFiles(categories); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (category: string, fileName: string) => {
    const { data } = await supabase.storage.from("document-library").createSignedUrl(`${category}/${fileName}`, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (category: string, fileName: string) => {
    const { error } = await supabase.storage.from("document-library").remove([`${category}/${fileName}`]);
    if (!error) { toast({ title: "Gelöscht" }); fetchAllFiles(categories); }
  };

  // Category CRUD
  const handleSaveCategory = async () => {
    if (!catForm.label.trim()) return;
    const key = catForm.key.trim() || catForm.label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");

    if (editingCatId) {
      await supabase.from("document_library_categories").update({ label: catForm.label.trim() }).eq("id", editingCatId);
    } else {
      await supabase.from("document_library_categories").insert({
        key,
        label: catForm.label.trim(),
        sort_order: categories.length + 1,
      });
    }
    setShowCatDialog(false);
    setEditingCatId(null);
    setCatForm({ key: "", label: "" });
    fetchCategories();
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!confirm(`Reiter "${cat.label}" wirklich loeschen?`)) return;
    await supabase.from("document_library_categories").delete().eq("id", cat.id);
    await supabase.from("document_library_links").delete().eq("category_key", cat.key);
    fetchCategories();
    fetchLinks();
  };

  // Link CRUD
  const handleSaveLink = async () => {
    if (!linkForm.title.trim() || !linkForm.url.trim()) return;
    await supabase.from("document_library_links").insert({
      category_key: activeTab,
      title: linkForm.title.trim(),
      url: linkForm.url.trim().startsWith("http") ? linkForm.url.trim() : `https://${linkForm.url.trim()}`,
      created_by: userId,
    });
    setShowLinkDialog(false);
    setLinkForm({ title: "", url: "" });
    fetchLinks();
  };

  const handleDeleteLink = async (id: string) => {
    await supabase.from("document_library_links").delete().eq("id", id);
    fetchLinks();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <img src="/schafferhofer-logo.png" alt="Schafferhofer Bau"
              className="h-14 sm:h-20 w-auto max-w-[180px] sm:max-w-[240px] cursor-pointer hover:opacity-80 transition-opacity object-contain"
              onClick={() => navigate("/")} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Dokumentenbibliothek</h1>
            <p className="text-sm text-muted-foreground">Gesetze, Richtlinien & Dokumente</p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => { setEditingCatId(null); setCatForm({ key: "", label: "" }); setShowCatDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Reiter
            </Button>
          )}
        </div>

        {categories.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Keine Kategorien vorhanden</p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
              {categories.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key} className="text-xs sm:text-sm">
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map(cat => {
              const catLinks = links.filter(l => l.category_key === cat.key);
              const catFiles = files[cat.key] || [];
              return (
                <TabsContent key={cat.key} value={cat.key}>
                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex gap-2 mb-4">
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" onChange={handleUpload} className="hidden" />
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Upload className="h-4 w-4 mr-1" /> {uploading ? "Lädt..." : "Dokument"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setLinkForm({ title: "", url: "" }); setShowLinkDialog(true); }}>
                        <LinkIcon className="h-4 w-4 mr-1" /> Link
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setEditingCatId(cat.id); setCatForm({ key: cat.key, label: cat.label }); setShowCatDialog(true); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Umbenennen
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteCategory(cat)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Reiter loeschen
                      </Button>
                    </div>
                  )}

                  {/* Links */}
                  {catLinks.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      {catLinks.map(link => (
                        <Card key={link.id}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <ExternalLink className="h-5 w-5 text-blue-600 shrink-0" />
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm font-medium text-blue-600 hover:underline truncate">
                              {link.title}
                            </a>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => handleDeleteLink(link.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Files */}
                  {loading ? (
                    <p className="text-center text-muted-foreground py-8">Lade...</p>
                  ) : catFiles.length === 0 && catLinks.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Keine Dokumente vorhanden</p>
                  ) : (
                    <div className="space-y-1.5">
                      {catFiles.map(file => (
                        <Card key={file.id}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <FileText className="h-5 w-5 text-primary shrink-0" />
                            <span className="flex-1 text-sm font-medium truncate cursor-pointer hover:underline" onClick={() => handleDownload(cat.key, file.name)}>
                              {file.name}
                            </span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleDownload(cat.key, file.name)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => handleDelete(cat.key, file.name)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </main>

      {/* Category Dialog */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCatId ? "Reiter umbenennen" : "Neuer Reiter"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={catForm.label} onChange={(e) => setCatForm({ ...catForm, label: e.target.value })} placeholder="z.B. Normen" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleSaveCategory} disabled={!catForm.label.trim()}>
              {editingCatId ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Titel</Label>
              <Input value={linkForm.title} onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })} placeholder="z.B. RIS Baugesetz" />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleSaveLink} disabled={!linkForm.title.trim() || !linkForm.url.trim()}>
              Hinzufuegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
