import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ProjectChat } from "@/components/ProjectChat";

export default function ProjectChatPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    if (!projectId) return;

    const init = async () => {
      // Fetch project name
      const { data: proj } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();
      if (proj) setProjectName(proj.name);

      // Check access
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setHasAccess(false); return; }

      // Admin check
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "administrator")
        .maybeSingle();

      if (role) {
        setHasAccess(true);
        return;
      }

      // Non-admin: check project_access
      const { data: access } = await supabase
        .from("project_access")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      setHasAccess(!!access);
    };

    init();
  }, [projectId]);

  if (!projectId) return null;

  // Loading
  if (hasAccess === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Wird geladen...</p>
      </div>
    );
  }

  // No access
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShieldX className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground text-lg">Kein Zugriff auf diesen Chat</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zu Projekten
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <MessageCircle className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base font-semibold truncate">
                Chat: {projectName}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <ProjectChat projectId={projectId} projectName={projectName} />
    </div>
  );
}
