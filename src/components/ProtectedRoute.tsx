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
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAllowed(false);
      return;
    }

    const [rolesRes, empRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("employees").select("kategorie, is_external").eq("user_id", user.id).maybeSingle(),
    ]);

    const isAdmin = rolesRes.data?.role === "administrator";
    const kategorie = empRes.data?.kategorie || null;
    const effective = getEffectiveRole(isAdmin, kategorie);
    const userLevel = ROLE_LEVEL[effective] ?? 2;
    const requiredLevel = ROLE_LEVEL[minRole] ?? 0;

    setAllowed(userLevel >= requiredLevel);
  };

  if (allowed === null) return null; // loading
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export { getEffectiveRole, ROLE_LEVEL };
export type { MinRole };
