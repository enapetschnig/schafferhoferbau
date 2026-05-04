import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DesktopSidebar } from "./DesktopSidebar";

export function AppLayout() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState("Benutzer");
  const [menuSettings, setMenuSettings] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    // Watchdog: garantiert Sidebar-Render auch wenn Queries haengen
    const watchdog = window.setTimeout(() => {
      if (active) {
        console.warn("AppLayout init watchdog fired — forcing ready=true");
        setReady(true);
      }
    }, 12000);

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("vorname, nachname")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) setUserName(`${profile.vorname} ${profile.nachname}`.trim());

        // Role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        const admin = roleData?.role === "administrator";
        setIsAdmin(admin);

        // Employee kategorie for role-based menu
        const { data: empData } = await supabase
          .from("employees")
          .select("kategorie")
          .eq("user_id", user.id)
          .maybeSingle();

        // Menu settings
        const effectiveRole = admin
          ? "admin"
          : empData?.kategorie === "vorarbeiter"
          ? "vorarbeiter"
          : empData?.kategorie === "lehrling"
          ? "lehrling"
          : empData?.kategorie === "extern"
          ? "extern"
          : "facharbeiter";

        const { data: menuData } = await supabase
          .from("role_menu_settings")
          .select("menu_key, visible")
          .eq("role", effectiveRole);

        if (menuData) {
          const settings: Record<string, boolean> = {};
          menuData.forEach((m: any) => { settings[m.menu_key] = m.visible; });
          setMenuSettings(settings);
        }
      } catch (e) {
        console.error("AppLayout init failed:", e);
      } finally {
        if (active) {
          window.clearTimeout(watchdog);
          setReady(true);
        }
      }
    };
    init();

    return () => {
      active = false;
      window.clearTimeout(watchdog);
    };
  }, []);

  const menuVisible = (key: string) => menuSettings[key] ?? true;

  if (!ready) return null;

  return (
    <div className="flex min-h-screen">
      <DesktopSidebar isAdmin={isAdmin} menuVisible={menuVisible} userName={userName} />
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
