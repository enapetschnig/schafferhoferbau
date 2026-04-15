import { useNavigate, useLocation } from "react-router-dom";
import {
  Clock, FolderKanban, FileText, Calendar, Building2, Truck,
  Shield, FileCheck, BookOpen, Settings, BarChart3, Package, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  adminOnly?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { key: "zeiterfassung", label: "Zeiterfassung", icon: <Clock className="h-4 w-4" />, path: "/time-tracking" },
  { key: "projekte", label: "Projekte", icon: <FolderKanban className="h-4 w-4" />, path: "/projects" },
  { key: "meine_stunden", label: "Meine Stunden", icon: <BarChart3 className="h-4 w-4" />, path: "/my-hours" },
  { key: "tagesberichte", label: "Tagesberichte", icon: <FileText className="h-4 w-4" />, path: "/daily-reports" },
  { key: "meine_dokumente", label: "Meine Dokumente", icon: <FileCheck className="h-4 w-4" />, path: "/my-documents" },
  { key: "dokumentenbibliothek", label: "Bibliothek", icon: <BookOpen className="h-4 w-4" />, path: "/document-library" },
  { key: "stundenubersicht", label: "Stundenubersicht", icon: <BarChart3 className="h-4 w-4" />, path: "/hours-report", adminOnly: true },
  { key: "plantafel", label: "Plantafel", icon: <Calendar className="h-4 w-4" />, path: "/schedule" },
  { key: "gerateverwaltung", label: "Geraeteverwaltung", icon: <Wrench className="h-4 w-4" />, path: "/equipment" },
  { key: "bestellungen", label: "Bestellungen", icon: <Package className="h-4 w-4" />, path: "/bestellungen" },
  { key: "eingangsrechnungen", label: "Rechnungen", icon: <FileText className="h-4 w-4" />, path: "/incoming-documents" },
  { key: "lieferscheine", label: "Lieferscheine", icon: <Truck className="h-4 w-4" />, path: "/delivery-notes" },
  { key: "lagerverwaltung", label: "Lagerverwaltung", icon: <Package className="h-4 w-4" />, path: "/warehouse" },
  { key: "arbeitsschutz", label: "Arbeitsschutz", icon: <Shield className="h-4 w-4" />, path: "/safety" },
  { key: "admin_bereich", label: "Administration", icon: <Settings className="h-4 w-4" />, path: "/admin", adminOnly: true },
  { key: "cloud_data", label: "Cloud-Daten", icon: <BarChart3 className="h-4 w-4" />, path: "/cloud-data", adminOnly: true },
];

interface Props {
  isAdmin: boolean;
  menuVisible: (key: string) => boolean;
  userName: string;
}

export function DesktopSidebar({ isAdmin, menuVisible, userName }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const visibleItems = MENU_ITEMS.filter(
    (item) => menuVisible(item.key) && (!item.adminOnly || isAdmin)
  );

  return (
    <aside className="hidden lg:flex flex-col w-56 border-r bg-card h-[calc(100vh-65px)] sticky top-[65px] shrink-0">
      {/* User info */}
      <div className="px-4 py-3 border-b">
        <p className="text-xs text-muted-foreground">Eingeloggt als</p>
        <p className="text-sm font-semibold truncate">{userName}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {visibleItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left mb-0.5",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t">
        <div className="flex items-center gap-2">
          <img
            src="/schafferhofer-logo.png"
            alt="Schafferhofer Bau"
            className="h-10 w-auto object-contain"
          />
        </div>
      </div>
    </aside>
  );
}
