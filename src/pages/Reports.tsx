import { FolderOpen, ImagePlus, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QuickUploadDialog } from "@/components/QuickUploadDialog";
import { ProjectFilesManager } from "@/components/ProjectFilesManager";
import { PageHeader } from "@/components/PageHeader";

type Project = {
  id: string;
  name: string;
};

type StorageFile = {
  name: string;
  id: string;
  created_at: string;
};

const Reports = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<StorageFile[]>([]);
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const [showFilesManager, setShowFilesManager] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchProjectPhotos(selectedProject);
    } else {
      setProjectPhotos([]);
    }
  }, [selectedProject]);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('status', 'aktiv')
      .order('name');

    if (error) {
      console.error('Error fetching projects:', error);
      toast.error('Fehler beim Laden der Projekte');
      return;
    }

    setProjects(data || []);
  };

  const fetchProjectPhotos = async (projectId: string) => {
    const { data, error } = await supabase.storage
      .from('project-photos')
      .list(projectId, {
        limit: 4,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('Error fetching photos:', error);
      return;
    }

    setProjectPhotos(data || []);
  };

  const getPhotoUrl = (projectId: string, fileName: string) => {
    const { data } = supabase.storage
      .from('project-photos')
      .getPublicUrl(`${projectId}/${fileName}`);
    return data.publicUrl;
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Projektdateien" />

      <main className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <FolderOpen className="w-8 h-8" />
            Projektdateien
          </h1>
          <p className="text-muted-foreground">Fotos und Dokumente nach Projekt verwalten</p>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">Projekt auswählen</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                {selectedProject
                  ? projects.find((project) => project.id === selectedProject)?.name || "Projekt auswählen"
                  : "Projekt auswählen..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Projekt suchen..." />
                <CommandList>
                  <CommandEmpty>Kein Projekt gefunden.</CommandEmpty>
                  <CommandGroup>
                    {projects.map((project) => (
                      <CommandItem
                        key={project.id}
                        value={project.name}
                        onSelect={() => {
                          setSelectedProject(project.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedProject === project.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {project.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {selectedProject ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Dateien: {projects.find(p => p.id === selectedProject)?.name}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilesManager(true)}
                  >
                    Alle Dateien anzeigen
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowQuickUpload(true)}
                    className="gap-2"
                  >
                    <ImagePlus className="w-4 h-4" />
                    Foto hochladen
                  </Button>
                </div>
              </div>
            </CardHeader>
            {projectPhotos.length > 0 ? (
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {projectPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => navigate(`/projects/${selectedProject}/photos`)}
                    >
                      <img
                        src={getPhotoUrl(selectedProject, photo.name)}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Noch keine Dateien für dieses Projekt vorhanden
                </p>
              </CardContent>
            )}
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">Wählen Sie ein Projekt aus, um dessen Dateien zu verwalten</p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Quick Upload Dialog */}
      {selectedProject && (
        <QuickUploadDialog
          projectId={selectedProject}
          documentType="photos"
          open={showQuickUpload}
          onClose={() => setShowQuickUpload(false)}
          onSuccess={() => fetchProjectPhotos(selectedProject)}
        />
      )}

      {/* Project Files Manager Dialog */}
      {selectedProject && (
        <Dialog open={showFilesManager} onOpenChange={setShowFilesManager}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Projektdateien verwalten</DialogTitle>
              <DialogDescription>
                Alle Dateien für {projects.find(p => p.id === selectedProject)?.name}
              </DialogDescription>
            </DialogHeader>
            <ProjectFilesManager
              projectId={selectedProject}
              defaultTab="photos"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Reports;
