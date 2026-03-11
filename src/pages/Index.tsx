import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, FolderKanban, Users, BarChart3, LogOut, FileText, Camera, ArrowRight, Info, User as UserIcon, UserPlus, Zap, Receipt, Bell, X, CloudRain, ClipboardList, Scale, Wrench, CalendarDays, BookOpen, Star, MapPin, Megaphone, MessageCircle, ChevronLeft, Package, ShieldCheck, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOnboarding } from "@/contexts/OnboardingContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { WeeklyAssignmentWidget } from "@/components/dashboard/WeeklyAssignmentWidget";

type Project = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

type RecentTimeEntry = {
  id: string;
  datum: string;
  stunden: number;
  taetigkeit: string;
  disturbance_id: string | null;
  projects: { name: string } | null;
  profiles?: {
    vorname: string;
    nachname: string;
  } | null;
};

const formatChatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return date.toLocaleDateString("de-AT", { weekday: "short" });
  return date.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
};

type ChatPreview = {
  type: "project" | "company";
  projectId?: string;
  projectName?: string;
  lastMessage: string;
  senderName: string;
  timestamp: string;
  unreadCount: number;
};

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentEntries, setRecentEntries] = useState<RecentTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [missingHoursDate, setMissingHoursDate] = useState<string | null>(null);
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [favoriteProjects, setFavoriteProjects] = useState<{ id: string; name: string; adresse: string | null }[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [chatDialogMode, setChatDialogMode] = useState<"select" | "project">("select");
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const { handleRestartInstallGuide } = useOnboarding();

  // Role-based visibility helper
  const ROLE_LEVEL: Record<string, number> = {
    extern: 0, lehrling: 1, facharbeiter: 2, vorarbeiter: 3, admin: 4,
  };
  const getEffectiveRole = () => {
    if (userRole === "administrator") return "admin";
    if (!kategorie) return "facharbeiter";
    if (kategorie === "extern") return "extern";
    return kategorie;
  };
  const roleLevel = ROLE_LEVEL[getEffectiveRole()] ?? 2;
  const canSee = (minRole: string) => roleLevel >= (ROLE_LEVEL[minRole] ?? 0);
  const isExternal = kategorie === "extern";

  const checkMissingHours = async (userId: string) => {
    const today = new Date();
    let checkDate = new Date(today);
    // If Monday, check Friday; otherwise check yesterday
    if (today.getDay() === 1) {
      checkDate.setDate(checkDate.getDate() - 3); // Friday
    } else if (today.getDay() === 0) {
      return; // Sunday — don't check
    } else if (today.getDay() === 6) {
      checkDate.setDate(checkDate.getDate() - 1); // Saturday checks Friday
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    const dateStr = checkDate.toISOString().split("T")[0];

    const { count } = await supabase
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("datum", dateStr);

    if (count === 0) {
      setMissingHoursDate(dateStr);
    }
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, updated_at")
      .eq("status", "aktiv")
      .order("updated_at", { ascending: false })
      .limit(5);

    if (data) {
      setProjects(data);
    }
  };

  const fetchFavoriteProjects = async (userId: string) => {
    const { data: favData } = await supabase
      .from("project_favorites")
      .select("project_id")
      .eq("user_id", userId);
    if (!favData || favData.length === 0) { setFavoriteProjects([]); return; }
    const ids = favData.map(f => f.project_id);
    const { data: projData } = await supabase
      .from("projects")
      .select("id, name, adresse")
      .in("id", ids)
      .eq("status", "aktiv");
    setFavoriteProjects(projData || []);
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, message, is_read, created_at")
      .eq("user_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setNotifications(data);
  };

  const fetchChatPreviews = async (userId: string, isAdminUser: boolean) => {
    const previews: ChatPreview[] = [];

    // 1. Get accessible project IDs
    let projectIds: string[] = [];
    let projectNameMap = new Map<string, string>();
    if (isAdminUser) {
      const { data: allProjs } = await supabase
        .from("projects")
        .select("id, name")
        .eq("status", "aktiv");
      projectIds = (allProjs || []).map(p => p.id);
      projectNameMap = new Map((allProjs || []).map(p => [p.id, p.name]));
    } else {
      const { data: accessData } = await supabase
        .from("project_access")
        .select("project_id")
        .eq("user_id", userId);
      projectIds = (accessData || []).map(a => a.project_id);
      if (projectIds.length > 0) {
        const { data: projData } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds)
          .eq("status", "aktiv");
        projectNameMap = new Map((projData || []).map(p => [p.id, p.name]));
        projectIds = (projData || []).map(p => p.id);
      }
    }

    // 2. Get latest message per project
    if (projectIds.length > 0) {
      const { data: messages } = await supabase
        .from("project_messages")
        .select("project_id, message, user_id, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false });

      const latestPerProject = new Map<string, { project_id: string; message: string | null; user_id: string; created_at: string }>();
      for (const msg of messages || []) {
        if (!latestPerProject.has(msg.project_id)) {
          latestPerProject.set(msg.project_id, msg);
        }
      }

      // 3. Get sender names
      const senderIds = [...new Set([...latestPerProject.values()].map(m => m.user_id))];
      const senderNameMap = new Map<string, string>();
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, vorname, nachname")
          .in("id", senderIds);
        for (const p of profiles || []) {
          senderNameMap.set(p.id, `${p.vorname || ""} ${p.nachname || ""}`.trim());
        }
      }

      // 4. Get unread counts from notifications
      const { data: unreadNotifs } = await supabase
        .from("notifications")
        .select("metadata")
        .eq("user_id", userId)
        .eq("type", "chat_message")
        .eq("is_read", false);

      const unreadPerProject = new Map<string, number>();
      for (const n of unreadNotifs || []) {
        const pid = (n.metadata as any)?.project_id;
        if (pid) unreadPerProject.set(pid, (unreadPerProject.get(pid) || 0) + 1);
      }

      // 5. Build project chat previews
      for (const [pid, msg] of latestPerProject) {
        previews.push({
          type: "project",
          projectId: pid,
          projectName: projectNameMap.get(pid) || "Projekt",
          lastMessage: msg.message || "",
          senderName: senderNameMap.get(msg.user_id) || "Unbekannt",
          timestamp: msg.created_at,
          unreadCount: unreadPerProject.get(pid) || 0,
        });
      }
    }

    // 6. Company chat (broadcast_messages) — latest message
    const { data: latestBroadcast } = await supabase
      .from("broadcast_messages")
      .select("message, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestBroadcast && latestBroadcast.length > 0) {
      const bc = latestBroadcast[0];
      let senderName = "Admin";
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("vorname, nachname")
        .eq("id", bc.user_id)
        .single();
      if (senderProfile) senderName = `${senderProfile.vorname || ""} ${senderProfile.nachname || ""}`.trim();

      // Unread count for broadcast
      const { data: bcUnread } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "broadcast_message")
        .eq("is_read", false);

      previews.push({
        type: "company",
        projectName: "Firmen-Chat",
        lastMessage: bc.message || "",
        senderName,
        timestamp: bc.created_at,
        unreadCount: bcUnread?.length || 0,
      });
    }

    // Sort: unread first, then by timestamp
    previews.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    setChatPreviews(previews);
  };

  const fetchRecentEntries = async (userId: string, role: string | null) => {
    // For admins, fetch all entries. For employees, only their own
    let query = supabase
      .from("time_entries")
      .select("id, datum, stunden, taetigkeit, disturbance_id, projects(name), profiles:user_id(vorname, nachname)")
      .order("datum", { ascending: false })
      .limit(5);

    if (role === "mitarbeiter") {
      query = query.eq("user_id", userId);
    }

    const { data } = await query;

    if (data) {
      setRecentEntries(data as any);
    }
  };

  const loadForUser = async (userId: string) => {
    // 1) Activation + name
    const profileReq = supabase
      .from("profiles")
      .select("vorname, nachname, is_active")
      .eq("id", userId)
      .maybeSingle();

    // 2) Role
    const roleReq = supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    // 3) Employee data (check if external)
    const employeeReq = supabase
      .from("employees")
      .select("is_external, kategorie")
      .eq("user_id", userId)
      .maybeSingle();

    const [{ data: profileData }, { data: roleData }, { data: employeeData }] = await Promise.all([profileReq, roleReq, employeeReq]);

    // Prüfe ob Benutzer aktiviert ist
    if (profileData) {
      setIsActivated(profileData.is_active !== false);
    } else {
      setIsActivated(true); // Fallback: neues Profil noch nicht angelegt
    }

    if (profileData) {
      setUserName(`${profileData.vorname} ${profileData.nachname}`.trim());
    } else {
      // Fallback: User-Metadaten verwenden
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata) {
        setUserName(`${user.user_metadata.vorname || ''} ${user.user_metadata.nachname || ''}`.trim() || 'Neuer Benutzer');
      }
    }

    const role = roleData?.role ?? null;
    setUserRole(role);
    setKategorie(employeeData?.kategorie || null);

    const fetchPendingUsers = async () => {
      if (role === "administrator") {
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("is_active", false);
        setPendingCount(count || 0);
      }
    };

    const fetchAllProjectsForAdmin = async () => {
      if (role === "administrator") {
        const { data } = await supabase
          .from("projects")
          .select("id, name, status, updated_at")
          .eq("status", "aktiv")
          .order("name");
        if (data) setAllProjects(data);
      }
    };

    await Promise.all([
      fetchProjects(),
      fetchRecentEntries(userId, role),
      fetchNotifications(userId),
      checkMissingHours(userId),
      fetchFavoriteProjects(userId),
      fetchPendingUsers(),
      fetchAllProjectsForAdmin(),
      fetchChatPreviews(userId, role === "administrator"),
    ]);

    setLoading(false);
  };

  useEffect(() => {
    let isMounted = true;

    const handleSession = async (nextSession: Session | null) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setIsActivated(null);
        setUserRole(null);
        setUserName("");
        setProjects([]);
        setRecentEntries([]);
        setLoading(false);
        navigate("/auth");
        return;
      }

      // Block any UI until activation is verified
      setLoading(true);
      setIsActivated(null);

      await loadForUser(nextSession.user.id);
    };

    // Listen for auth changes FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Never run async supabase calls inside this callback.
      window.setTimeout(() => {
        void handleSession(nextSession);
      }, 0);
    });

    // THEN check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.setTimeout(() => {
        void handleSession(session);
      }, 0);
    });

    // Realtime subscription for projects
    const projectsChannel = supabase
      .channel("dashboard-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        fetchProjects();
      })
      .subscribe();

    // Realtime subscription for time entries
    const entriesChannel = supabase
      .channel("dashboard-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: user ? `user_id=eq.${user.id}` : undefined,
        },
        () => {
          if (user) fetchRecentEntries(user.id, userRole);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(entriesChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleDismissNotification = async (notificationId: string) => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/auth");
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isActivated === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <img src="/schafferhofer-logo.svg" alt="Schafferhofer Bau" className="h-20 mx-auto" />
          <h1 className="text-xl font-bold">Konto noch nicht freigeschaltet</h1>
          <p className="text-muted-foreground">
            Dein Konto muss vom Administrator freigeschaltet werden, bevor du die App nutzen kannst.
            Du wirst benachrichtigt, sobald dein Zugang aktiviert wurde.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>Abmelden</Button>
        </div>
      </div>
    );
  }

  const isAdmin = userRole === "administrator";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <img src="/schafferhofer-logo.svg" alt="Schafferhofer Bau" className="h-10 sm:h-14 w-auto" />
              <div className="hidden sm:block h-8 w-px bg-border" />
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm text-muted-foreground">Hallo</span>
                <span className="text-sm sm:text-base font-semibold">{userName || "Benutzer"}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserIcon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Menü</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Mein Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={handleRestartInstallGuide}>
                  <Info className="mr-2 h-4 w-4" />
                  <span>App zum Startbildschirm hinzufügen</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />

                <ChangePasswordDialog />
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Abmelden</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
            {isAdmin ? "Admin Dashboard" : "Mein Dashboard"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isAdmin 
              ? "Verwaltung aller Projekte und Mitarbeiter" 
              : "Zeiterfassung und Projektdokumentation"}
          </p>
        </div>

        {/* Pending Activations Banner (Admin only) */}
        {isAdmin && pendingCount > 0 && (
          <div
            className="mb-4 flex items-center gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 p-3 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors"
            onClick={() => navigate("/admin")}
          >
            <UserPlus className="h-6 w-6 text-orange-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-orange-800 dark:text-orange-200">
                {pendingCount} neue{pendingCount === 1 ? "r" : ""} Mitarbeiter warte{pendingCount === 1 ? "t" : "n"} auf Freischaltung
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300">
                Jetzt freischalten und Rolle zuweisen
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-orange-600 shrink-0" />
          </div>
        )}

        {/* Notifications Banner */}
        {notifications.length > 0 && (
          <div className="mb-4 space-y-2">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 cursor-pointer"
                onClick={() => {
                  handleDismissNotification(notif.id);
                  if (notif.type === "krankmeldung_upload") navigate("/admin");
                  if (notif.type === "lohnzettel_upload") navigate("/my-documents");
                  if (notif.type === "broadcast_message") navigate("/company-chat");
                  if (notif.type === "chat_message") navigate("/company-chat");
                  if (notif.type === "account_activated") window.location.reload();
                }}
              >
                <Bell className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{notif.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismissNotification(notif.id);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Missing Hours Reminder — nicht für Externe */}
        {!isExternal && missingHoursDate && (
          <div
            className="mb-4 flex items-center gap-3 rounded-lg border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/20 p-3 cursor-pointer"
            onClick={() => navigate(`/time-tracking?date=${missingHoursDate}`)}
          >
            <Clock className="h-5 w-5 text-yellow-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-yellow-800 dark:text-yellow-200">Stunden nicht erfasst</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Du hast am {new Date(missingHoursDate).toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "2-digit" })} keine Stunden erfasst — jetzt nachtragen?
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-yellow-600 shrink-0" />
          </div>
        )}

        {/* Favoriten-Projekte — nicht für Externe */}
        {!isExternal && favoriteProjects.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Star className="h-5 w-5 fill-red-500 text-red-500" />
              Meine Favoriten
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {favoriteProjects.map(p => (
                <Card
                  key={p.id}
                  className="cursor-pointer border-red-500 bg-red-50 dark:bg-red-950/20 hover:shadow-lg transition-all"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 fill-red-500 text-red-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{p.name}</p>
                        {p.adresse && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" /> {p.adresse}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Chat-Übersicht (WhatsApp-Style) */}
        {chatPreviews.length > 0 ? (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-600" /> Chats
                </CardTitle>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => { setChatDialogMode("select"); setShowChatDialog(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> Neuer Chat
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {chatPreviews.map(chat => (
                <div
                  key={chat.projectId || "company"}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(chat.type === "company" ? "/company-chat" : `/projects/${chat.projectId}/chat`)}
                >
                  <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: chat.type === "company" ? "rgb(34 197 94 / 0.15)" : "rgb(59 130 246 / 0.15)" }}>
                    {chat.type === "company"
                      ? <Megaphone className="h-5 w-5 text-green-600" />
                      : <FolderKanban className="h-5 w-5 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className={`font-medium truncate ${chat.unreadCount > 0 ? "text-foreground" : "text-foreground/80"}`}>
                        {chat.type === "company" ? "Firmen-Chat" : chat.projectName}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {formatChatTime(chat.timestamp)}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${chat.unreadCount > 0 ? "text-foreground/80 font-medium" : "text-muted-foreground"}`}>
                      {chat.senderName}: {chat.lastMessage || "Bild"}
                    </p>
                  </div>
                  {chat.unreadCount > 0 && (
                    <Badge className="bg-green-500 text-white rounded-full min-w-[24px] h-6 flex items-center justify-center shrink-0">
                      {chat.unreadCount}
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <div
            className="mb-6 flex items-center gap-4 rounded-xl border-2 border-green-400 bg-green-50 dark:bg-green-950/20 p-4 cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors shadow-sm"
            onClick={() => {
              if (isAdmin) {
                setChatDialogMode("select");
                setShowChatDialog(true);
              } else {
                navigate("/company-chat");
              }
            }}
          >
            <div className="h-12 w-12 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
              {isAdmin ? <MessageCircle className="h-6 w-6 text-green-600" /> : <Megaphone className="h-6 w-6 text-green-600" />}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-green-900 dark:text-green-100">{isAdmin ? "Chat starten" : "Firmen-Chat"}</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                {isAdmin ? "Firmen-Chat oder Projekt-Chat starten" : "Nachrichten & Infos vom Chef"}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-green-600 shrink-0" />
          </div>
        )}

        {/* Chat starten Dialog (Admin) */}
        <Dialog open={showChatDialog} onOpenChange={(open) => { setShowChatDialog(open); if (!open) setChatDialogMode("select"); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {chatDialogMode === "project" && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mr-1" onClick={() => setChatDialogMode("select")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                {chatDialogMode === "select" ? "Chat starten" : "Projekt auswählen"}
              </DialogTitle>
            </DialogHeader>

            {chatDialogMode === "select" ? (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Card
                  className="cursor-pointer hover:shadow-md transition-all hover:border-green-500/50 border-2"
                  onClick={() => { setShowChatDialog(false); navigate("/company-chat"); }}
                >
                  <CardContent className="p-4 text-center space-y-2">
                    <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto">
                      <Megaphone className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="font-semibold text-sm">Firmen-Chat</p>
                    <p className="text-xs text-muted-foreground">An Mitarbeiter senden</p>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:shadow-md transition-all hover:border-blue-500/50 border-2"
                  onClick={() => setChatDialogMode("project")}
                >
                  <CardContent className="p-4 text-center space-y-2">
                    <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto">
                      <FolderKanban className="h-6 w-6 text-blue-600" />
                    </div>
                    <p className="font-semibold text-sm">Projekt-Chat</p>
                    <p className="text-xs text-muted-foreground">In einem Projekt</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto pt-2">
                {allProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Keine aktiven Projekte</p>
                ) : (
                  allProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => { setShowChatDialog(false); navigate(`/projects/${project.id}/chat`); }}
                    >
                      <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">{project.name}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  ))
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Wochenplanung Widget */}
        {!isExternal && user && (
          <WeeklyAssignmentWidget userId={user.id} />
        )}

        {/* Main Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {/* Zeiterfassung - Für alle */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => navigate(isExternal ? "/external-time-tracking" : "/time-tracking")}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl">Zeiterfassung</CardTitle>
              <CardDescription className="text-sm">
                Stunden auf Projekte buchen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="sm">Stunden erfassen</Button>
            </CardContent>
          </Card>

          {/* Projekte - Ab Facharbeiter */}
          {canSee("facharbeiter") && (
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => navigate("/projects")}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <FolderKanban className="h-6 w-6 text-accent" />
              </div>
              <CardTitle className="text-lg sm:text-xl">Projekte</CardTitle>
              <CardDescription className="text-sm">
                {isAdmin ? "Bauvorhaben & Dokumentation" : "Pläne, Bilder, Berichte, etc. hochladen"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="sm" variant="secondary">Projekte öffnen</Button>
            </CardContent>
          </Card>
          )}

          {/* Meine Stunden - Für alle */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" 
            onClick={() => navigate("/my-hours")}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl">Meine Stunden</CardTitle>
              <CardDescription className="text-sm">
                {isAdmin ? "Eigene gebuchte Zeiten anzeigen & bearbeiten" : "Übersicht gebuchter Zeiten"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="sm" variant="outline">Anzeigen</Button>
            </CardContent>
          </Card>

          {/* Regieberichte - Ab Vorarbeiter */}
          {canSee("vorarbeiter") && (
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => navigate("/disturbances")}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl">Regiearbeiten</CardTitle>
              <CardDescription className="text-sm">
                Service-Einsätze dokumentieren
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="sm" variant="outline">Regiearbeiten öffnen</Button>
            </CardContent>
          </Card>
          )}

          {/* Tagesberichte - Ab Vorarbeiter */}
          {canSee("vorarbeiter") && (
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => navigate("/daily-reports")}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl">Tagesberichte</CardTitle>
              <CardDescription className="text-sm">
                Tages- & Zwischenberichte erstellen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="sm" variant="outline">Berichte öffnen</Button>
            </CardContent>
          </Card>
          )}

          {/* Meine Dokumente - Ab Lehrling, nicht für Admin (hat eigenen Bereich) */}
          {canSee("lehrling") && !isAdmin && (
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" 
              onClick={() => navigate("/my-documents")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-accent" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Meine Dokumente</CardTitle>
                <CardDescription className="text-sm">
                  Lohnzettel & Krankmeldungen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Dokumente öffnen</Button>
              </CardContent>
            </Card>
          )}


          {/* Dokumentenbibliothek - Ab Vorarbeiter */}
          {canSee("vorarbeiter") && (
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => navigate("/documents")}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl">Dokumentenbibliothek</CardTitle>
              <CardDescription className="text-sm">
                Gesetze, Richtlinien & Vorschriften
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="sm" variant="outline">Bibliothek öffnen</Button>
            </CardContent>
          </Card>
          )}

          {/* Admin: Stundenauswertung */}
          {isAdmin && (
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" 
              onClick={() => navigate("/hours-report")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Stundenauswertung</CardTitle>
                <CardDescription className="text-sm">
                  Auswertung der Projektstunden
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm">Auswerten</Button>
              </CardContent>
            </Card>
          )}

          {/* Admin: Arbeitszeitaufzeichnung */}
          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/hours-report?tab=arbeitszeitaufzeichnung")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Scale className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Arbeitszeitaufzeichnung</CardTitle>
                <CardDescription className="text-sm">
                  Gesetzliche Aufzeichnung gemäß § 26 AZG
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Aufzeichnung öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Plantafel - Ab Vorarbeiter */}
          {canSee("vorarbeiter") && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/schedule")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Plantafel</CardTitle>
                <CardDescription className="text-sm">
                  Zeit- und Ressourcenplanung
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Plantafel öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Admin: Geräteverwaltung */}
          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/equipment")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wrench className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Geräteverwaltung</CardTitle>
                <CardDescription className="text-sm">
                  Geräte, Werkzeuge & Inventar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Geräte öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Admin: Eingangsrechnungen */}
          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/incoming-invoices")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Receipt className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Eingangsrechnungen</CardTitle>
                <CardDescription className="text-sm">
                  Rechnungen prüfen & abgleichen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Eingangsrechnungen öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Vorarbeiter+: Evaluierungen & Unterweisungen */}
          {canSee("vorarbeiter") && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/safety-evaluations")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Evaluierungen</CardTitle>
                <CardDescription className="text-sm">
                  Sicherheitsunterweisungen & Evaluierungen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Evaluierungen öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Alle: Arbeitsschutz */}
          {!isExternal && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/my-safety")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-green-500" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Arbeitsschutz</CardTitle>
                <CardDescription className="text-sm">
                  Meine Unterweisungen & Evaluierungen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Arbeitsschutz öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Lieferscheine & Rechnungen erfassen */}
          {canSee("facharbeiter") && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/incoming-documents")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-blue-500" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Lieferscheine</CardTitle>
                <CardDescription className="text-sm">
                  Lieferscheine & Rechnungen fotografieren
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Erfassen</Button>
              </CardContent>
            </Card>
          )}

          {/* Lagerverwaltung */}
          {canSee("facharbeiter") && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/warehouse")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-amber-500" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Lagerverwaltung</CardTitle>
                <CardDescription className="text-sm">
                  Lagerbestand & Lieferscheine
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Öffnen</Button>
              </CardContent>
            </Card>
          )}

          {/* Admin: Mitarbeiter */}
          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
              onClick={() => navigate("/admin")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg sm:text-xl">Admin-Bereich</CardTitle>
                <CardDescription className="text-sm">
                  Benutzerverwaltung, Stunden & Verwaltung
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" size="sm" variant="outline">Verwalten</Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Time Entries */}
        {recentEntries.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">
              {isAdmin ? 'Letzte Projektbuchungen (Alle Mitarbeiter)' : 'Meine letzten Buchungen'}
            </h2>
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <Card 
                  key={entry.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    if (entry.disturbance_id) {
                      navigate(`/disturbances/${entry.disturbance_id}`);
                    } else {
                      navigate("/my-hours");
                    }
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {entry.projects?.name || (entry.disturbance_id ? "Regiebericht" : "Unbekanntes Projekt")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{entry.taetigkeit}</p>
                        {entry.profiles && (
                          <p className="text-xs text-muted-foreground">
                            von {entry.profiles.vorname} {entry.profiles.nachname}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <p className="font-bold">{entry.stunden} h</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-3" 
              onClick={() => navigate("/my-hours")}
            >
              Alle Stunden anzeigen
            </Button>
          </div>
        )}

        {!isAdmin && (
          <Card className="mt-6 bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">Schnellhilfe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>✓ <strong>Zeiterfassung:</strong> Täglich Stunden auf Projekte buchen</p>
              <p>✓ <strong>Projekte:</strong> Fotos, Regieberichte & Dokumente hochladen</p>
              <p>✓ <strong>Meine Stunden:</strong> Übersicht aller gebuchten Zeiten</p>
            </CardContent>
          </Card>
        )}

        {/* Projects Overview — nicht für Externe */}
        {!isExternal && projects.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold">Aktive Projekte</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
                Alle anzeigen
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            
            <div className="grid gap-3 sm:gap-4">
              {projects.map((project) => (
                <Card 
                  key={project.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate("/projects")}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FolderKanban className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm sm:text-base truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Aktualisiert: {new Date(project.updated_at).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
