import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, X, MessageSquare, Users, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CompanyChat } from "@/components/CompanyChat";

type ChatChannel = {
  id: string;
  name: string;
  channel_type: string;
  target_roles: string[];
  target_user_id: string | null;
  created_by: string;
  created_at: string;
};

type Employee = {
  user_id: string;
  vorname: string;
  nachname: string;
  kategorie: string;
};

const ROLE_OPTIONS = [
  { value: "vorarbeiter", label: "Vorarbeiter" },
  { value: "facharbeiter", label: "Facharbeiter" },
  { value: "lehrling", label: "Lehrling" },
  { value: "extern", label: "Extern" },
];

export default function CompanyChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // All visible channels from DB
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  // IDs of currently open tabs (persisted in localStorage)
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // New channel dialog
  const [showNewChannelDialog, setShowNewChannelDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"all" | "roles" | "direct">("all");
  const [newChannelRoles, setNewChannelRoles] = useState<string[]>([]);
  const [newChannelDirectUserId, setNewChannelDirectUserId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [creating, setCreating] = useState(false);

  // Load user + channels on mount
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Admin check
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "administrator")
        .maybeSingle();
      const admin = !!roleData;
      setIsAdmin(admin);

      // Restore open tabs from localStorage
      const storedTabs = localStorage.getItem(`company-chat-tabs-${user.id}`);
      const restoredTabs: string[] = storedTabs ? JSON.parse(storedTabs) : [];
      setOpenTabIds(restoredTabs);

      // Load visible channels
      const { data: chData } = await supabase
        .from("chat_channels")
        .select("*")
        .order("created_at", { ascending: true });

      const loaded: ChatChannel[] = (chData || []) as ChatChannel[];
      setChannels(loaded);

      // Determine active tab: URL param > first restored tab > first channel
      const urlTab = searchParams.get("tab");
      let tabToOpen = urlTab || restoredTabs[0] || null;

      // If URL tab not yet in openTabs, add it
      if (urlTab && !restoredTabs.includes(urlTab)) {
        const updated = [urlTab, ...restoredTabs];
        setOpenTabIds(updated);
        localStorage.setItem(`company-chat-tabs-${user.id}`, JSON.stringify(updated));
        tabToOpen = urlTab;
      }

      // If no tabs and we have channels, open the first one
      if (!tabToOpen && loaded.length > 0) {
        const first = loaded[0].id;
        setOpenTabIds([first]);
        localStorage.setItem(`company-chat-tabs-${user.id}`, JSON.stringify([first]));
        tabToOpen = first;
      }

      setActiveTabId(tabToOpen);

      // Mark broadcast notifications as read
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("type", "broadcast_message")
        .eq("is_read", false);

      setLoading(false);
    };

    init();
  }, []);

  // Realtime: new channel created → auto-open for eligible users
  useEffect(() => {
    if (!userId) return;

    const ch = supabase
      .channel("chat-channels-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_channels" },
        (payload) => {
          const newChannel = payload.new as ChatChannel;
          setChannels((prev) => {
            if (prev.some((c) => c.id === newChannel.id)) return prev;
            return [...prev, newChannel];
          });
          // Auto-open new channel as tab
          setOpenTabIds((prev) => {
            if (prev.includes(newChannel.id)) return prev;
            const updated = [...prev, newChannel.id];
            localStorage.setItem(`company-chat-tabs-${userId}`, JSON.stringify(updated));
            return updated;
          });
          setActiveTabId(newChannel.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_channels" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          setChannels((prev) => prev.filter((c) => c.id !== deletedId));
          setOpenTabIds((prev) => {
            const updated = prev.filter((id) => id !== deletedId);
            localStorage.setItem(`company-chat-tabs-${userId}`, JSON.stringify(updated));
            return updated;
          });
          setActiveTabId((prev) => {
            if (prev === deletedId) return null;
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const openTab = (channelId: string) => {
    if (!openTabIds.includes(channelId)) {
      const updated = [...openTabIds, channelId];
      if (userId) localStorage.setItem(`company-chat-tabs-${userId}`, JSON.stringify(updated));
      setOpenTabIds(updated);
    }
    setActiveTabId(channelId);
  };

  const closeTab = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = openTabIds.filter((id) => id !== channelId);
    if (userId) localStorage.setItem(`company-chat-tabs-${userId}`, JSON.stringify(updated));
    setOpenTabIds(updated);
    if (activeTabId === channelId) {
      setActiveTabId(updated.length > 0 ? updated[updated.length - 1] : null);
    }
  };

  // Create new channel
  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !userId) return;
    if (newChannelType === "direct" && !newChannelDirectUserId) return;

    setCreating(true);

    let target_roles: string[] = [];
    let target_user_id: string | null = null;
    let channel_type = "broadcast";

    if (newChannelType === "roles" && newChannelRoles.length > 0) {
      target_roles = newChannelRoles;
    } else if (newChannelType === "direct") {
      channel_type = "direct";
      // Find profile_id of selected employee
      const emp = employees.find((e) => e.user_id === newChannelDirectUserId);
      if (emp) {
        // target_user_id must be profile_id = user_id (same UUID in this app)
        target_user_id = emp.user_id;
      }
    }

    const { data, error } = await supabase
      .from("chat_channels")
      .insert({
        name: newChannelName.trim(),
        channel_type,
        target_roles,
        target_user_id,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating channel:", error);
    } else if (data) {
      // Tab is auto-opened via realtime subscription
    }

    setCreating(false);
    setShowNewChannelDialog(false);
    setNewChannelName("");
    setNewChannelType("all");
    setNewChannelRoles([]);
    setNewChannelDirectUserId("");
  };

  // Load employees for direct message picker
  const loadEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("user_id, vorname, nachname, kategorie")
      .order("nachname");
    setEmployees((data || []) as Employee[]);
  };

  const toggleNewChannelRole = (role: string) => {
    setNewChannelRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const getChannelIcon = (channel: ChatChannel) => {
    if (channel.channel_type === "direct") return <UserIcon className="h-3.5 w-3.5 shrink-0" />;
    if (channel.target_roles.length > 0) return <Users className="h-3.5 w-3.5 shrink-0" />;
    return <MessageSquare className="h-3.5 w-3.5 shrink-0" />;
  };

  const openTabChannels = channels.filter((c) => openTabIds.includes(c.id));
  const closedChannels = channels.filter((c) => !openTabIds.includes(c.id));
  const activeChannel = channels.find((c) => c.id === activeTabId) || null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <MessageSquare className="h-5 w-5 text-primary" />
            <h1 className="text-sm sm:text-base font-semibold flex-1 truncate">Firmen-Chat</h1>
            {isAdmin && (
              <Button
                size="sm"
                onClick={() => {
                  loadEmployees();
                  setShowNewChannelDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Neuer Chat</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
            {openTabChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => openTab(channel.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors shrink-0 ${
                  activeTabId === channel.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-foreground"
                }`}
              >
                {getChannelIcon(channel)}
                <span className="max-w-[120px] truncate">{channel.name}</span>
                <span
                  className={`ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors ${
                    activeTabId === channel.id ? "hover:bg-white/20" : ""
                  }`}
                  onClick={(e) => closeTab(channel.id, e)}
                  role="button"
                  aria-label="Tab schließen"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            ))}

            {/* Available but not open channels */}
            {closedChannels.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                {openTabChannels.length > 0 && <span className="text-muted-foreground/40 text-xs px-1">|</span>}
                {closedChannels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => openTab(channel.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors shrink-0"
                  >
                    {getChannelIcon(channel)}
                    <span className="max-w-[100px] truncate">{channel.name}</span>
                  </button>
                ))}
              </div>
            )}

            {channels.length === 0 && (
              <p className="text-sm text-muted-foreground py-0.5">
                {isAdmin ? "Noch kein Chat — erstelle den ersten mit \"Neuer Chat\"" : "Noch keine Chats verfügbar"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Chat content */}
      <div className="flex-1 flex flex-col container mx-auto px-0 sm:px-4 lg:px-6 overflow-hidden">
        {activeTabId && activeChannel ? (
          <div className="flex flex-col h-[calc(100vh-10rem)]">
            <CompanyChat channelId={activeTabId} isAdmin={isAdmin} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 py-16 px-4 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">Kein Chat geöffnet</p>
            {channels.length > 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                Wähle einen Chat aus der Tab-Leiste oben
              </p>
            ) : isAdmin ? (
              <p className="text-sm text-muted-foreground mt-1">
                Erstelle deinen ersten Chat-Kanal mit „Neuer Chat"
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                Du wirst automatisch benachrichtigt, wenn ein Chat für dich erstellt wird
              </p>
            )}
          </div>
        )}
      </div>

      {/* New Channel Dialog */}
      <Dialog open={showNewChannelDialog} onOpenChange={setShowNewChannelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Neuer Chat-Kanal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name des Chats</Label>
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="z.B. Alle Mitarbeiter, Vorarbeiter-Runde..."
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateChannel(); }}
              />
            </div>

            <div>
              <Label>Empfänger</Label>
              <div className="space-y-2 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channelType"
                    checked={newChannelType === "all"}
                    onChange={() => setNewChannelType("all")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Alle Mitarbeiter</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channelType"
                    checked={newChannelType === "roles"}
                    onChange={() => setNewChannelType("roles")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Bestimmte Rollen</span>
                </label>
                {newChannelType === "roles" && (
                  <div className="ml-6 flex flex-wrap gap-2">
                    {ROLE_OPTIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => toggleNewChannelRole(r.value)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          newChannelRoles.includes(r.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted border-border hover:border-primary/50"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channelType"
                    checked={newChannelType === "direct"}
                    onChange={() => setNewChannelType("direct")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Direktnachricht an einen Mitarbeiter</span>
                </label>
                {newChannelType === "direct" && (
                  <div className="ml-6">
                    <Select value={newChannelDirectUserId} onValueChange={setNewChannelDirectUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Mitarbeiter auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((emp) => (
                          <SelectItem key={emp.user_id} value={emp.user_id}>
                            {emp.vorname} {emp.nachname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewChannelDialog(false)}>Abbrechen</Button>
              <Button
                onClick={handleCreateChannel}
                disabled={
                  creating ||
                  !newChannelName.trim() ||
                  (newChannelType === "roles" && newChannelRoles.length === 0) ||
                  (newChannelType === "direct" && !newChannelDirectUserId)
                }
              >
                {creating ? "Erstelle..." : "Chat erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
