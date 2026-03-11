import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Send, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type BroadcastMessage = {
  id: string;
  user_id: string;
  message: string | null;
  image_url: string | null;
  target_roles: string[];
  created_at: string;
  sender_name?: string;
};

const PAGE_SIZE = 50;

const ROLE_LABELS: Record<string, string> = {
  alle: "Alle",
  lehrling: "Lehrlinge",
  facharbeiter: "Facharbeiter",
  vorarbeiter: "Vorarbeiter",
  extern: "Extern",
};

const ROLE_OPTIONS = ["alle", "lehrling", "facharbeiter", "vorarbeiter", "extern"];

export function CompanyChat({ isAdmin, userKategorie }: { isAdmin: boolean; userKategorie: string | null }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["alle"]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Fetch profile name
  const getProfileName = async (userId: string): Promise<string> => {
    if (profileCache[userId]) return profileCache[userId];
    const { data } = await supabase
      .from("profiles")
      .select("vorname, nachname")
      .eq("id", userId)
      .maybeSingle();
    const name = data ? `${data.vorname} ${data.nachname}`.trim() : "Unbekannt";
    setProfileCache(prev => ({ ...prev, [userId]: name }));
    return name;
  };

  const enrichMessages = async (msgs: BroadcastMessage[]): Promise<BroadcastMessage[]> => {
    return Promise.all(
      msgs.map(async (msg) => ({
        ...msg,
        sender_name: await getProfileName(msg.user_id),
      }))
    );
  };

  // Filter messages for non-admin users
  const filterForUser = (msgs: BroadcastMessage[]): BroadcastMessage[] => {
    if (isAdmin) return msgs;
    return msgs.filter(
      (msg) => msg.target_roles.includes("alle") || (userKategorie && msg.target_roles.includes(userKategorie))
    );
  };

  // Initial load
  useEffect(() => {
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("broadcast_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        console.error("Error loading broadcast messages:", error);
        setInitialLoad(false);
        return;
      }

      const reversed = (data || []).reverse();
      const enriched = await enrichMessages(reversed);
      setMessages(enriched);
      setHasMore((data || []).length === PAGE_SIZE);
      setInitialLoad(false);
    };

    loadMessages();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("broadcast-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "broadcast_messages",
        },
        async (payload) => {
          const newMsg = payload.new as BroadcastMessage;
          const enriched = await enrichMessages([newMsg]);
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched[0].id)) return prev;
            return [...prev, enriched[0]];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!initialLoad) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, initialLoad]);

  // Load older messages
  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);

    const oldestMessage = messages[0];
    const { data, error } = await supabase
      .from("broadcast_messages")
      .select("*")
      .lt("created_at", oldestMessage.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error("Error loading more:", error);
      setLoadingMore(false);
      return;
    }

    const reversed = (data || []).reverse();
    const enriched = await enrichMessages(reversed);
    setMessages((prev) => [...enriched, ...prev]);
    setHasMore((data || []).length === PAGE_SIZE);
    setLoadingMore(false);
  };

  // Toggle role selection
  const toggleRole = (role: string) => {
    if (role === "alle") {
      setSelectedRoles(["alle"]);
      return;
    }
    setSelectedRoles((prev) => {
      const without = prev.filter((r) => r !== "alle" && r !== role);
      if (prev.includes(role)) {
        return without.length === 0 ? ["alle"] : without;
      }
      return [...without, role];
    });
  };

  // Send text message
  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !currentUserId || sending) return;

    setSending(true);
    setNewMessage("");

    const { error } = await supabase.from("broadcast_messages").insert({
      user_id: currentUserId,
      message: text,
      target_roles: selectedRoles,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Nachricht konnte nicht gesendet werden" });
      setNewMessage(text);
    } else {
      sendNotifications(text.substring(0, 100));
      sendPush(text.substring(0, 100));
    }
    setSending(false);
  };

  // Send photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    setSending(true);
    const filePath = `${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("broadcast-chat")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: uploadError.message });
      setSending(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("broadcast-chat").getPublicUrl(filePath);

    const { error } = await supabase.from("broadcast_messages").insert({
      user_id: currentUserId,
      image_url: urlData.publicUrl,
      target_roles: selectedRoles,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Foto konnte nicht gesendet werden" });
    } else {
      sendNotifications("📷 Foto gesendet");
      sendPush("📷 Foto gesendet");
    }

    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Send in-app notifications
  const sendNotifications = async (messagePreview: string) => {
    if (!currentUserId) return;

    const { data: employees } = await supabase
      .from("employees")
      .select("user_id, kategorie");

    const recipients = (employees || [])
      .filter((e) => e.user_id !== currentUserId)
      .filter((e) => selectedRoles.includes("alle") || selectedRoles.includes(e.kategorie));

    if (recipients.length > 0) {
      await supabase.from("notifications").insert(
        recipients.map((e) => ({
          user_id: e.user_id,
          created_by: currentUserId,
          type: "broadcast_message",
          title: "Neue Firmen-Nachricht",
          message: messagePreview,
          metadata: {},
        }))
      );
    }
  };

  // Send push notifications via Edge Function
  const sendPush = async (messagePreview: string) => {
    if (!currentUserId) return;

    const { data: employees } = await supabase
      .from("employees")
      .select("user_id, kategorie");

    const recipientIds = (employees || [])
      .filter((e) => e.user_id !== currentUserId)
      .filter((e) => selectedRoles.includes("alle") || selectedRoles.includes(e.kategorie))
      .map((e) => e.user_id);

    if (recipientIds.length > 0) {
      supabase.functions.invoke("send-push", {
        body: {
          user_ids: recipientIds,
          title: "Firmen-Chat",
          body: messagePreview,
          url: "/company-chat",
        },
      });
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    if (isYesterday) return `Gestern ${time}`;
    return `${d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" })} ${time}`;
  };

  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Heute";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Gestern";
    return d.toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long" });
  };

  const shouldShowDate = (index: number, filtered: BroadcastMessage[]) => {
    if (index === 0) return true;
    const curr = new Date(filtered[index].created_at).toDateString();
    const prev = new Date(filtered[index - 1].created_at).toDateString();
    return curr !== prev;
  };

  const getRoleBadge = (roles: string[]) => {
    if (roles.includes("alle")) return "Alle";
    return roles.map((r) => ROLE_LABELS[r] || r).join(", ");
  };

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chat wird geladen...</p>
      </div>
    );
  }

  const visibleMessages = filterForUser(messages);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Role selection for admin */}
      {isAdmin && (
        <div className="border-b bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground mb-1.5">Empfänger:</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role}
                onClick={() => toggleRole(role)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedRoles.includes(role)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border hover:border-primary/50"
                }`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {hasMore && (
          <div className="text-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs text-muted-foreground"
            >
              <ChevronUp className="h-4 w-4 mr-1" />
              {loadingMore ? "Lädt..." : "Ältere Nachrichten laden"}
            </Button>
          </div>
        )}

        {visibleMessages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">Noch keine Nachrichten</p>
            {isAdmin && <p className="text-muted-foreground text-xs mt-1">Schreibe die erste Nachricht an dein Team!</p>}
          </div>
        )}

        {visibleMessages.map((msg, index) => {
          const isOwn = msg.user_id === currentUserId;
          const showDate = shouldShowDate(index, visibleMessages);

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
                    {getDateLabel(msg.created_at)}
                  </span>
                </div>
              )}

              <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mt-2`}>
                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 py-2 ${
                    isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                  }`}
                >
                  {/* Sender name */}
                  {!isOwn && (
                    <p className="text-xs font-semibold mb-0.5 opacity-80">{msg.sender_name}</p>
                  )}

                  {/* Target role badge */}
                  <span
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded mb-1 ${
                      isOwn ? "bg-primary-foreground/20" : "bg-background/60"
                    }`}
                  >
                    An: {getRoleBadge(msg.target_roles)}
                  </span>

                  {/* Image */}
                  {msg.image_url && (
                    <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={msg.image_url}
                        alt="Foto"
                        className="rounded-lg max-w-full max-h-64 object-cover mb-1 cursor-pointer hover:opacity-90"
                      />
                    </a>
                  )}

                  {/* Text */}
                  {msg.message && <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>}

                  {/* Timestamp */}
                  <p className={`text-[10px] mt-0.5 text-right ${isOwn ? "opacity-70" : "text-muted-foreground"}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area - only for admin */}
      {isAdmin && (
        <div className="border-t bg-card p-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
            >
              <Camera className="h-5 w-5" />
            </Button>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Nachricht an Team..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
            />
            <Button
              size="icon"
              className="shrink-0"
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
