import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CompanyChat } from "@/components/CompanyChat";

export default function CompanyChatPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userKategorie, setUserKategorie] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Admin check
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "administrator")
        .maybeSingle();
      setIsAdmin(!!role);

      // Employee kategorie
      const { data: emp } = await supabase
        .from("employees")
        .select("kategorie")
        .eq("user_id", user.id)
        .maybeSingle();
      setUserKategorie(emp?.kategorie || null);

      setLoading(false);
    };

    init();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <Megaphone className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base font-semibold truncate">
                Firmen-Chat
              </h1>
            </div>
          </div>
        </div>
      </header>

      <CompanyChat isAdmin={isAdmin} userKategorie={userKategorie} />
    </div>
  );
}
