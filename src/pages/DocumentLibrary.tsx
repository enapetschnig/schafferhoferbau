import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Upload, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type DocFile = { name: string; id: string; created_at: string };

const CATEGORIES = [
  { key: "baugesetz", label: "Baugesetz" },
  { key: "oib", label: "OIB-Richtlinien" },
  { key: "stmk", label: "Stmk. Baugesetz" },
  { key: "diverse", label: "Diverse" },
] as const;

export default function DocumentLibrary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("baugesetz");
  const [files, setFiles] = useState<Record<string, DocFile[]>>({
    baugesetz: [], oib: [], stmk: [], diverse: [],
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    checkAdmin();
    fetchAllFiles();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    setIsAdmin(data?.role === "administrator");
  };

  const fetchAllFiles = async () => {
    setLoading(true);
    const result: Record<string, DocFile[]> = { baugesetz: [], oib: [], stmk: [], diverse: [] };

    await Promise.all(
      CATEGORIES.map(async (cat) => {
        const { data } = await supabase.storage.from("document-library").list(cat.key, {
          sortBy: { column: "name", order: "asc" },
        });
        if (data) {
          result[cat.key] = data
            .filter(f => f.name !== ".emptyFolderPlaceholder")
            .map(f => ({ name: f.name, id: f.id || f.name, created_at: f.created_at || "" }));
        }
      })
    );

    setFiles(result);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const path = `${activeTab}/${file.name}`;
    const { error } = await supabase.storage.from("document-library").upload(path, file, { upsert: true });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Hochgeladen", description: file.name });
      fetchAllFiles();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (category: string, fileName: string) => {
    const { data } = await supabase.storage.from("document-library").createSignedUrl(`${category}/${fileName}`, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleDelete = async (category: string, fileName: string) => {
    const { error } = await supabase.storage.from("document-library").remove([`${category}/${fileName}`]);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht" });
      fetchAllFiles();
    }
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
            <img
              src="/schafferhofer-logo.png"
              alt="Schafferhofer Bau"
              className="h-10 w-10 sm:h-14 sm:w-14 cursor-pointer hover:opacity-80 transition-opacity object-contain"
              onClick={() => navigate("/")}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">Dokumentenbibliothek</h1>
          <p className="text-sm text-muted-foreground">Gesetze, Richtlinien & Dokumente</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            {CATEGORIES.map(cat => (
              <TabsTrigger key={cat.key} value={cat.key} className="text-xs sm:text-sm">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map(cat => (
            <TabsContent key={cat.key} value={cat.key}>
              {isAdmin && (
                <div className="mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                    onChange={handleUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? "Wird hochgeladen..." : "Dokument hochladen"}
                  </Button>
                </div>
              )}

              {loading ? (
                <p className="text-center text-muted-foreground py-8">Lade...</p>
              ) : files[cat.key].length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Keine Dokumente vorhanden</p>
              ) : (
                <div className="space-y-2">
                  {files[cat.key].map(file => (
                    <Card key={file.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <span className="flex-1 text-sm font-medium truncate">{file.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleDownload(cat.key, file.name)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive"
                            onClick={() => handleDelete(cat.key, file.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
