import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileText, Upload, Trash2, Download, Plus, Pencil, ExternalLink,
  Link as LinkIcon, Star, StickyNote, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFileName } from "@/lib/storageFileName";

type DocFile = { name: string; id: string; created_at: string };
type Category = { id: string; key: string; label: string; sort_order: number };
type LibLink = { id: string; category_key: string; title: string; url: string };
type FileMeta = { file_path: string; bezeichnung: string | null; beschreibung: string | null };

const isImageName = (n: string) => /\.(jpe?g|png|gif|webp)$/i.test(n);

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

  // Pre-fetched URLs (synchron oeffnen, kein Popup-Block)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Pro-User-Favoriten + Pro-Datei-Metadaten
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [metas, setMetas] = useState<Record<string, FileMeta>>({});

  // Edit-Dialog Bezeichnung + Notiz
  const [editMeta, setEditMeta] = useState<{
    open: boolean; filePath: string; bezeichnung: string; beschreibung: string; saving: boolean;
  }>({ open: false, filePath: "", bezeichnung: "", beschreibung: "", saving: false });

  // Lightbox-State (Bilder durchblaettern)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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
    await fetchMetas();
    await fetchFavorites(user.id);
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

  const fetchMetas = async () => {
    const { data } = await supabase.from("document_library_meta").select("file_path, bezeichnung, beschreibung");
    if (data) {
      const map: Record<string, FileMeta> = {};
      for (const m of data as FileMeta[]) map[m.file_path] = m;
      setMetas(map);
    }
  };

  const fetchFavorites = async (uid: string) => {
    const { data } = await supabase
      .from("document_library_favorites")
      .select("file_path")
      .eq("user_id", uid);
    if (data) setFavs(new Set((data as { file_path: string }[]).map((d) => d.file_path)));
  };

  const fetchAllFiles = async (cats: Category[]) => {
    const result: Record<string, DocFile[]> = {};
    await Promise.all(
      cats.map(async (cat) => {
        const { data } = await supabase.storage.from("document-library").list(cat.key, {
          sortBy: { column: "name", order: "asc" },
        });
        result[cat.key] = (data || [])
          .filter((f) => f.name !== ".emptyFolderPlaceholder")
          .map((f) => ({ name: f.name, id: f.id || f.name, created_at: f.created_at || "" }));
      })
    );
    setFiles(result);
    // Sofort signierte URLs vorbereiten, damit Klick synchron oeffnet
    await prepareSignedUrls(result);
  };

  const prepareSignedUrls = async (filesMap: Record<string, DocFile[]>) => {
    const all: { path: string }[] = [];
    for (const [catKey, list] of Object.entries(filesMap)) {
      for (const f of list) all.push({ path: `${catKey}/${f.name}` });
    }
    if (all.length === 0) return;
    // Bulk-Signed-URLs (max 60 min)
    const { data, error } = await supabase.storage
      .from("document-library")
      .createSignedUrls(all.map((a) => a.path), 3600);
    if (error || !data) return;
    const map: Record<string, string> = {};
    for (const item of data) {
      if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
    }
    setSignedUrls(map);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const safeName = sanitizeStorageFileName(file.name);
    const path = `${activeTab}/${safeName}`;
    const { error } = await supabase.storage.from("document-library").upload(path, file, { upsert: true });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      // Original-Filename als Bezeichnung speichern, damit der User ihn weiterhin sieht
      if (file.name !== safeName) {
        await supabase.from("document_library_meta").upsert({
          file_path: path,
          bezeichnung: file.name.replace(/\.[^.]+$/, ""),
        });
      }
      toast({ title: "Hochgeladen", description: file.name });
      await fetchAllFiles(categories);
      await fetchMetas();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (category: string, fileName: string) => {
    const path = `${category}/${fileName}`;
    const { error } = await supabase.storage.from("document-library").remove([path]);
    if (!error) {
      // Metadata + Favoriten dieser Datei mit aufraeumen
      await supabase.from("document_library_meta").delete().eq("file_path", path);
      await supabase.from("document_library_favorites").delete().eq("file_path", path);
      toast({ title: "Gelöscht" });
      fetchAllFiles(categories);
      fetchMetas();
      fetchFavorites(userId);
    }
  };

  const toggleFavorite = async (filePath: string) => {
    if (!userId) return;
    if (favs.has(filePath)) {
      await supabase
        .from("document_library_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("file_path", filePath);
      setFavs((prev) => { const n = new Set(prev); n.delete(filePath); return n; });
    } else {
      await supabase
        .from("document_library_favorites")
        .insert({ user_id: userId, file_path: filePath });
      setFavs((prev) => new Set(prev).add(filePath));
    }
  };

  const openEditMeta = (filePath: string) => {
    const m = metas[filePath];
    setEditMeta({
      open: true,
      filePath,
      bezeichnung: m?.bezeichnung || "",
      beschreibung: m?.beschreibung || "",
      saving: false,
    });
  };

  const saveEditMeta = async () => {
    setEditMeta((s) => ({ ...s, saving: true }));
    const payload = {
      file_path: editMeta.filePath,
      bezeichnung: editMeta.bezeichnung.trim() || null,
      beschreibung: editMeta.beschreibung.trim() || null,
    };
    await supabase.from("document_library_meta").upsert(payload);
    toast({ title: "Gespeichert" });
    setEditMeta({ open: false, filePath: "", bezeichnung: "", beschreibung: "", saving: false });
    fetchMetas();
  };

  const handleFileClick = (filePath: string, fileName: string) => {
    const url = signedUrls[filePath];
    if (!url) {
      toast({ variant: "destructive", title: "Fehler", description: "URL noch nicht bereit, bitte kurz warten." });
      return;
    }
    if (isImageName(fileName)) {
      setLightboxImage(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Category CRUD
  const handleSaveCategory = async () => {
    if (!catForm.label.trim()) return;
    const key = catForm.key.trim() || catForm.label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (editingCatId) {
      await supabase.from("document_library_categories").update({ label: catForm.label.trim() }).eq("id", editingCatId);
    } else {
      await supabase.from("document_library_categories").insert({
        key, label: catForm.label.trim(), sort_order: categories.length + 1,
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

  // Sortierung: Favoriten zuerst, dann nach Bezeichnung/Filename
  const sortedFiles = (catKey: string): DocFile[] => {
    const list = files[catKey] || [];
    return [...list].sort((a, b) => {
      const aPath = `${catKey}/${a.name}`;
      const bPath = `${catKey}/${b.name}`;
      const aFav = favs.has(aPath);
      const bFav = favs.has(bPath);
      if (aFav !== bFav) return aFav ? -1 : 1;
      const aLabel = (metas[aPath]?.bezeichnung || a.name).toLowerCase();
      const bLabel = (metas[bPath]?.bezeichnung || b.name).toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  };

  // Bilder der aktuellen Kategorie fuer Lightbox-Swipe
  const lightboxImagesForCat = (catKey: string): { url: string; name: string }[] => {
    return sortedFiles(catKey)
      .filter((f) => isImageName(f.name))
      .map((f) => ({ url: signedUrls[`${catKey}/${f.name}`], name: f.name }))
      .filter((x) => !!x.url);
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
              {categories.map((cat) => (
                <TabsTrigger key={cat.key} value={cat.key} className="text-xs sm:text-sm">
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((cat) => {
              const catLinks = links.filter((l) => l.category_key === cat.key);
              const catFiles = sortedFiles(cat.key);
              return (
                <TabsContent key={cat.key} value={cat.key}>
                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp" onChange={handleUpload} className="hidden" />
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
                      {catLinks.map((link) => (
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
                      {catFiles.map((file) => {
                        const filePath = `${cat.key}/${file.name}`;
                        const meta = metas[filePath];
                        const isImg = isImageName(file.name);
                        const isFav = favs.has(filePath);
                        const hasMeta = !!(meta?.bezeichnung || meta?.beschreibung);
                        const displayName = meta?.bezeichnung || file.name;
                        const note = meta?.beschreibung;
                        return (
                          <Card key={file.id}>
                            <CardContent className="p-3 flex items-center gap-3">
                              {isImg && signedUrls[filePath] ? (
                                <img
                                  src={signedUrls[filePath]}
                                  alt={file.name}
                                  className="w-10 h-10 object-cover rounded shrink-0 cursor-pointer"
                                  onClick={() => handleFileClick(filePath, file.name)}
                                />
                              ) : (
                                <FileText className="h-5 w-5 text-primary shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  className="block w-full text-left text-sm font-medium truncate hover:underline"
                                  onClick={() => handleFileClick(filePath, file.name)}
                                >
                                  {displayName}
                                </button>
                                {meta?.bezeichnung && (
                                  <p className="text-[11px] text-muted-foreground/70 truncate">{file.name}</p>
                                )}
                                {note && (
                                  <p className="text-xs text-foreground/80 mt-0.5 italic line-clamp-2 whitespace-pre-wrap">{note}</p>
                                )}
                                {!hasMeta && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openEditMeta(filePath); }}
                                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Notiz hinzufügen
                                  </button>
                                )}
                              </div>
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                                onClick={() => toggleFavorite(filePath)}
                                title={isFav ? "Favorit entfernen" : "Als Favorit markieren"}
                              >
                                <Star className={`h-4 w-4 ${isFav ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`} />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                                onClick={() => openEditMeta(filePath)}
                                title={hasMeta ? "Notiz / Bezeichnung bearbeiten" : "Notiz hinzufügen"}
                              >
                                <StickyNote className={`h-4 w-4 ${hasMeta ? "fill-amber-200 text-amber-700" : "text-muted-foreground"}`} />
                              </Button>
                              <a
                                href={signedUrls[filePath] || "#"}
                                download={file.name}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => { if (!signedUrls[filePath]) e.preventDefault(); }}
                                className="shrink-0"
                              >
                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                  <span><Download className="h-4 w-4" /></span>
                                </Button>
                              </a>
                              {isAdmin && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => handleDelete(cat.key, file.name)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </main>

      {/* Bezeichnung + Notiz */}
      <Dialog
        open={editMeta.open}
        onOpenChange={(o) => { if (!o && !editMeta.saving) setEditMeta((s) => ({ ...s, open: false })); }}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="truncate">Bezeichnung & Notiz</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 min-w-0">
            <div className="min-w-0">
              <Label>Bezeichnung (Kurz-Name)</Label>
              <Input
                value={editMeta.bezeichnung}
                onChange={(e) => setEditMeta((s) => ({ ...s, bezeichnung: e.target.value }))}
                placeholder="z.B. AUVA-Merkblatt 2024"
                className="mt-1 w-full"
              />
              <p className="text-xs text-muted-foreground mt-1 break-all">
                Original-Datei: {editMeta.filePath}
              </p>
            </div>
            <div className="min-w-0">
              <Label>Notiz</Label>
              <Textarea
                value={editMeta.beschreibung}
                onChange={(e) => setEditMeta((s) => ({ ...s, beschreibung: e.target.value }))}
                placeholder="z.B. Gilt ab 2026, Stand März 2026"
                rows={3}
                className="mt-1 w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditMeta({ open: false, filePath: "", bezeichnung: "", beschreibung: "", saving: false })}
              disabled={editMeta.saving}
            >
              Abbrechen
            </Button>
            <Button onClick={saveEditMeta} disabled={editMeta.saving}>
              {editMeta.saving ? "Speichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox fuer Bilder mit Swipe */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 bg-black/95">
          {(() => {
            const imgs = lightboxImagesForCat(activeTab);
            const idx = lightboxImage ? imgs.findIndex((x) => x.url === lightboxImage) : -1;
            const goPrev = () => { if (idx > 0) setLightboxImage(imgs[idx - 1].url); };
            const goNext = () => { if (idx < imgs.length - 1) setLightboxImage(imgs[idx + 1].url); };
            return (
              <>
                <div className="flex justify-between items-center px-4 py-2">
                  <span className="text-white text-sm">
                    {idx >= 0 && imgs.length > 0 ? `${idx + 1} / ${imgs.length}` : "Bild-Vorschau"}
                  </span>
                  <div className="flex gap-2">
                    {lightboxImage && (
                      <a href={lightboxImage} download className="text-white hover:text-gray-300">
                        <Download className="h-5 w-5" />
                      </a>
                    )}
                    <button onClick={() => setLightboxImage(null)} className="text-white hover:text-gray-300">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 flex items-center justify-center p-4 overflow-auto touch-pan-y select-none"
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    (e.currentTarget as any)._touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
                  }}
                  onTouchEnd={(e) => {
                    const start = (e.currentTarget as any)._touchStart;
                    if (!start) return;
                    const t = e.changedTouches[0];
                    const dx = t.clientX - start.x;
                    const dy = t.clientY - start.y;
                    const dt = Date.now() - start.time;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) {
                      if (dx < 0) goNext();
                      else goPrev();
                    }
                    (e.currentTarget as any)._touchStart = null;
                  }}
                >
                  {lightboxImage && (
                    <img
                      src={lightboxImage}
                      alt="Vorschau"
                      className="max-w-full max-h-full object-contain rounded-lg pointer-events-none"
                      draggable={false}
                    />
                  )}
                </div>
                {imgs.length > 1 && (
                  <div className="flex justify-center gap-4 pb-4">
                    <button className="text-white disabled:opacity-30 p-2" disabled={idx <= 0} onClick={goPrev}>
                      <ChevronLeft className="h-8 w-8" />
                    </button>
                    <span className="text-white text-xs self-center opacity-70">Wischen zum Blättern</span>
                    <button className="text-white disabled:opacity-30 p-2" disabled={idx >= imgs.length - 1} onClick={goNext}>
                      <ChevronRight className="h-8 w-8" />
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
