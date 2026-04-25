import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Send, ChevronUp, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizeImageOrientation } from "@/lib/imageOrientation";
import { VoiceAIInput } from "@/components/VoiceAIInput";

type BroadcastMessage = {
  id: string;
  user_id: string;
  message: string | null;
  image_url: string | null;
  target_roles: string[];
  channel_id: string | null;
  created_at: string;
  sender_name?: string;
};

type ChatChannel = {
  id: string;
  name: string;
  channel_type: string;
  target_roles: string[];
  target_user_id: string | null;
  created_by: string;
};

const PAGE_SIZE = 50;

export function CompanyChat({
  channelId,
  isAdmin,
}: {
  channelId: string;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Load channel details
  useEffect(() => {
    if (!channelId) return;
    supabase
      .from("chat_channels")
      .select("id, name, channel_type, target_roles, target_user_id, created_by")
      .eq("id", channelId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setChannel(data as ChatChannel);
      });
  }, [channelId]);

  // Fetch profile name (with cache)
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

  // Initial load — filter by channel_id
  useEffect(() => {
    if (!channelId) return;
    setInitialLoad(true);
    setMessages([]);

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("broadcast_messages")
        .select("*")
        .eq("channel_id", channelId)
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
  }, [channelId]);

  // Realtime subscription — filter by channel_id
  useEffect(() => {
    if (!channelId) return;

    const ch = supabase
      .channel(`broadcast-chat-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "broadcast_messages",
          filter: `channel_id=eq.${channelId}`,
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
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "broadcast_messages",
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!initialLoad) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, initialLoad]);

  // Load older messages
  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0 || !channelId) return;
    setLoadingMore(true);

    const oldestMessage = messages[0];
    const { data, error } = await supabase
      .from("broadcast_messages")
      .select("*")
      .eq("channel_id", channelId)
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

  // Send text message
  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !currentUserId || sending || !channelId || !channel) return;

    setSending(true);
    setNewMessage("");

    const roles = channel.target_roles.length > 0 ? channel.target_roles : ["alle"];
    const { error } = await supabase.from("broadcast_messages").insert({
      user_id: currentUserId,
      message: text,
      target_roles: roles,
      channel_id: channelId,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Nachricht konnte nicht gesendet werden" });
      setNewMessage(text);
    } else {
      sendNotifications(text.substring(0, 100), roles, channel);
      sendPush(text.substring(0, 100), roles, channel);
    }
    setSending(false);
  };

  // Delete message (admin only)
  const handleDeleteMessage = async (msgId: string) => {
    const { error } = await supabase.from("broadcast_messages").delete().eq("id", msgId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    }
  };

  // Send photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile || !currentUserId || !channelId || !channel) return;

    setSending(true);
    // EXIF-Rotation in Pixeldaten einbacken
    const file = await normalizeImageOrientation(rawFile);
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

    const roles = channel.target_roles.length > 0 ? channel.target_roles : ["alle"];
    const { error } = await supabase.from("broadcast_messages").insert({
      user_id: currentUserId,
      image_url: urlData.publicUrl,
      target_roles: roles,
      channel_id: channelId,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Foto konnte nicht gesendet werden" });
    } else {
      sendNotifications("📷 Foto gesendet", roles, channel);
      sendPush("📷 Foto gesendet", roles, channel);
    }

    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Send in-app notifications
  const sendNotifications = async (messagePreview: string, roles: string[], ch: ChatChannel) => {
    if (!currentUserId) return;

    let recipients: { user_id: string }[] = [];

    if (ch.channel_type === "direct" && ch.target_user_id) {
      // Direct message: notify only the target user
      if (ch.target_user_id !== currentUserId) {
        recipients = [{ user_id: ch.target_user_id }];
      }
    } else {
      // Broadcast: notify by roles
      const { data: employees } = await supabase
        .from("employees")
        .select("user_id, kategorie");

      recipients = (employees || [])
        .filter((e) => e.user_id !== currentUserId)
        .filter((e) => roles.includes("alle") || roles.includes(e.kategorie));
    }

    if (recipients.length > 0) {
      await supabase.from("notifications").insert(
        recipients.map((e) => ({
          user_id: e.user_id,
          created_by: currentUserId,
          type: "broadcast_message",
          title: `Neue Nachricht — ${ch.name}`,
          message: messagePreview,
          metadata: { channel_id: channelId },
        }))
      );
    }
  };

  // Send push notifications
  const sendPush = async (messagePreview: string, roles: string[], ch: ChatChannel) => {
    if (!currentUserId) return;

    let recipientIds: string[] = [];

    if (ch.channel_type === "direct" && ch.target_user_id) {
      if (ch.target_user_id !== currentUserId) {
        recipientIds = [ch.target_user_id];
      }
    } else {
      const { data: employees } = await supabase
        .from("employees")
        .select("user_id, kategorie");

      recipientIds = (employees || [])
        .filter((e) => e.user_id !== currentUserId)
        .filter((e) => roles.includes("alle") || roles.includes(e.kategorie))
        .map((e) => e.user_id);
    }

    if (recipientIds.length > 0) {
      supabase.functions.invoke("send-push", {
        body: {
          user_ids: recipientIds,
          title: ch.name,
          body: messagePreview,
          url: `/company-chat?tab=${channelId}`,
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

  const shouldShowDate = (index: number, msgs: BroadcastMessage[]) => {
    if (index === 0) return true;
    const curr = new Date(msgs[index].created_at).toDateString();
    const prev = new Date(msgs[index - 1].created_at).toDateString();
    return curr !== prev;
  };

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chat wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
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

        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">Noch keine Nachrichten</p>
            <p className="text-muted-foreground text-xs mt-1">Schreibe die erste Nachricht!</p>
          </div>
        )}

        {messages.map((msg, index) => {
          const isOwn = msg.user_id === currentUserId;
          const showDate = shouldShowDate(index, messages);

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
                    {getDateLabel(msg.created_at)}
                  </span>
                </div>
              )}

              <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mt-2 group`}>
                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 py-2 relative ${
                    isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                  }`}
                >
                  {/* Sender name */}
                  {!isOwn && (
                    <p className="text-xs font-semibold mb-0.5 opacity-80">{msg.sender_name}</p>
                  )}

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

                  {/* Admin delete */}
                  {isAdmin && (
                    <button
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteMessage(msg.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
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
          <VoiceAIInput
            buttonsPosition="inline"
            context="notiz"
            value={newMessage}
            onChange={setNewMessage}
            placeholder="Nachricht schreiben..."
            className="flex-1"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
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
    </div>
  );
}
