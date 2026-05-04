import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type MinRole = "extern" | "lehrling" | "facharbeiter" | "vorarbeiter" | "admin";

const ROLE_LEVEL: Record<string, number> = {
  extern: 0,
  lehrling: 1,
  facharbeiter: 2,
  vorarbeiter: 3,
  admin: 4,
};

function getEffectiveRole(isAdmin: boolean, kategorie: string | null): string {
  if (isAdmin) return "admin";
  if (!kategorie) return "facharbeiter";
  if (kategorie === "extern") return "extern";
  return kategorie; // lehrling, facharbeiter, vorarbeiter
}

export function ProtectedRoute({
  children,
  minRole,
}: {
  children: React.ReactNode;
  minRole: MinRole;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    // Watchdog: bei haengender Auth-Query nach 10s als Facharbeiter freigeben (fail-soft)
    const watchdog = window.setTimeout(() => {
      if (active) {
        console.warn("ProtectedRoute watchdog fired — fail-soft");
        const requiredLevel = ROLE_LEVEL[minRole] ?? 0;
        setAllowed(2 >= requiredLevel); // facharbeiter-Level als sicherer Default
      }
    }, 10000);

    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (active) setAllowed(false);
          return;
        }

        const settled = await Promise.allSettled([
          supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
          supabase.from("employees").select("kategorie, is_external").eq("user_id", user.id).maybeSingle(),
        ]);
        const rolesData = settled[0].status === "fulfilled" ? (settled[0].value as any).data : null;
        const empData = settled[1].status === "fulfilled" ? (settled[1].value as any).data : null;

        const isAdmin = rolesData?.role === "administrator";
        const kategorie = empData?.kategorie || null;
        const effective = getEffectiveRole(isAdmin, kategorie);
        const userLevel = ROLE_LEVEL[effective] ?? 2;
        const requiredLevel = ROLE_LEVEL[minRole] ?? 0;

        if (active) setAllowed(userLevel >= requiredLevel);
      } catch (e) {
        console.error("ProtectedRoute checkAccess failed:", e);
        if (active) {
          const requiredLevel = ROLE_LEVEL[minRole] ?? 0;
          setAllowed(2 >= requiredLevel); // fail-soft auf facharbeiter-Level
        }
      } finally {
        window.clearTimeout(watchdog);
      }
    };
    checkAccess();

    return () => {
      active = false;
      window.clearTimeout(watchdog);
    };
  }, [minRole]);

  if (allowed === null) return null; // loading
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export { getEffectiveRole, ROLE_LEVEL };
export type { MinRole };
