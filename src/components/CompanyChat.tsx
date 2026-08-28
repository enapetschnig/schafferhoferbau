import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Send, ChevronUp, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFileName } from "@/lib/storageFileName";
import { formatChatText } from "@/lib/formatChatText";
import { handleChatInputKeyDown } from "@/lib/chatInputKeyHandler";
import { useToast } from "@/hooks/use-toast";
import { normalizeImageOrientation } from "@/lib/imageOrientation";
import {
  CHAT_FILE_ACCEPT,
  attachmentKindFromFile,
  attachmentKindFromUrl,
  attachmentSummary,
  validateChatFiles,
} from "@/lib/chatAttachments";
import { VoiceAIInput } from "@/components/VoiceAIInput";
import { ReadReceipt, type Recipient } from "@/components/chat/ReadReceipt";

/** Ein Lese-Eintrag aus broadcast_message_reads. */
type ReadRow = { message_id: string; user_id: string; read_at: string };

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
  // Fortschritt nur bei Mehrfachauswahl ("3 von 5")
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lesebestaetigungen + Empfaengerkreis des Kanals
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [channelMembers, setChannelMembers] = useState<Recipient[]>([]);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Empfaengerkreis des Kanals — spiegelt die Sichtbarkeits-Regel aus der
  // chat_channels-RLS: direct = beide Beteiligte; broadcast ohne Rollen =
  // alle Aktiven; broadcast mit Rollen = passende employees.kategorie.
  useEffect(() => {
    if (!channel) return;
    (async () => {
      let ids: string[] = [];
      if (channel.channel_type === "direct") {
        ids = [channel.created_by, channel.target_user_id].filter(Boolean) as string[];
      } else if (channel.target_roles.length > 0) {
        const { data: emps } = await supabase
          .from("employees")
          .select("user_id, kategorie")
          .not("user_id", "is", null)
          .in("kategorie", channel.target_roles);
        ids = (emps || []).map((e: any) => e.user_id);
      }
      const query = supabase.from("profiles").select("id, vorname, nachname").eq("is_active", true);
      const { data: profs } =
        channel.channel_type === "direct" || channel.target_roles.length > 0
          ? await query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
          : await query;
      setChannelMembers(
        (profs || []).map((p: any) => ({
          id: p.id,
          name: `${p.vorname} ${p.nachname}`.trim() || "Unbekannt",
        }))
      );
    })();
  }, [channel]);

  // Fremde Nachrichten als gelesen markieren.
  useEffect(() => {
    if (!currentUserId || messages.length === 0) return;
    const unread = messages
      .filter((m) => m.user_id !== currentUserId)
      .filter((m) => !reads.some((r) => r.message_id === m.id && r.user_id === currentUserId))
      .map((m) => m.id);
    if (unread.length === 0) return;
    (async () => {
      const rows = unread.map((id) => ({ message_id: id, user_id: currentUserId }));
      const { data, error } = await (supabase as any)
        .from("broadcast_message_reads")
        .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true })
        .select("message_id, user_id, read_at");
      // Fehler nicht verschlucken — sonst sieht eine fehlgeschlagene
      // Markierung exakt aus wie "noch nicht gelesen" und faellt nie auf.
      if (error) {
        console.error("Lesebestaetigung (Firmen-Chat) fehlgeschlagen:", error, {
          anzahl: rows.length,
        });
        return;
      }
      if (data && data.length > 0) setReads((prev) => [...prev, ...(data as ReadRow[])]);
    })();
  }, [messages, currentUserId, reads]);

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

      // Lesebestaetigungen laden (RLS liefert nur Erlaubtes).
      const msgIds = (data || []).map((m: any) => m.id);
      if (msgIds.length > 0) {
        const { data: readData } = await (supabase as any)
          .from("broadcast_message_reads")
          .select("message_id, user_id, read_at")
          .in("message_id", msgIds);
        if (readData) setReads(readData as ReadRow[]);
      }
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
      // Lesebestaetigungen live
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "broadcast_message_reads" },
        (payload) => {
          const row = payload.new as ReadRow;
          setReads((prev) =>
            prev.some((r) => r.message_id === row.message_id && r.user_id === row.user_id)
              ? prev
              : [...prev, row]
          );
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

    // Lesebestaetigungen der nachgeladenen Nachrichten holen — sonst wirken
    // aeltere Nachrichten faelschlich als ungelesen.
    const olderIds = (data || []).map((m: any) => m.id);
    if (olderIds.length > 0) {
      const { data: readData } = await (supabase as any)
        .from("broadcast_message_reads")
        .select("message_id, user_id, read_at")
        .in("message_id", olderIds);
      if (readData) {
        setReads((prev) => {
          const known = new Set(prev.map((r) => `${r.message_id}|${r.user_id}`));
          return [...prev, ...(readData as ReadRow[]).filter((r) => !known.has(`${r.message_id}|${r.user_id}`))];
        });
      }
    }
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

  // Send photos, videos or PDFs - je Datei eine eigene Nachricht
  const uploadAndSendFiles = async (rawFiles: File[]) => {
    if (!currentUserId || !channelId || !channel || rawFiles.length === 0) return;

    const { accepted, rejected } = validateChatFiles(rawFiles);
    if (rejected.length > 0) {
      toast({
        variant: "destructive",
        title: rejected.length === 1 ? "Datei übersprungen" : `${rejected.length} Dateien übersprungen`,
        description: rejected.map((r) => `${r.name}: ${r.reason}`).join("\n"),
      });
    }
    if (accepted.length === 0) return;

    setSending(true);
    setUploadProgress(accepted.length > 1 ? { done: 0, total: accepted.length } : null);

    const roles = channel.target_roles.length > 0 ? channel.target_roles : ["alle"];
    const sent: File[] = [];
    const failed: string[] = [];

    // Nacheinander, damit die Reihenfolge im Chat erhalten bleibt
    for (const rawFile of accepted) {
      const kind = attachmentKindFromFile(rawFile);
      // Nur Bilder durch die EXIF-Rotation schicken
      const file = kind === "image" ? await normalizeImageOrientation(rawFile) : rawFile;
      const filePath = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeStorageFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("broadcast-chat")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        failed.push(rawFile.name);
        setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
        continue;
      }

      const { data: urlData } = supabase.storage.from("broadcast-chat").getPublicUrl(filePath);
      const { error } = await supabase.from("broadcast_messages").insert({
        user_id: currentUserId,
        image_url: urlData.publicUrl,
        // Bei PDF/Video den Dateinamen als Titel mitschicken
        message: kind === "image" ? null : rawFile.name,
        target_roles: roles,
        channel_id: channelId,
      });

      if (error) failed.push(rawFile.name);
      else sent.push(rawFile);

      setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
    }

    if (failed.length > 0) {
      toast({ variant: "destructive", title: "Nicht gesendet", description: failed.join(", ") });
    }
    // Eine Sammel-Benachrichtigung statt einer je Datei
    if (sent.length > 0) {
      const summary = attachmentSummary(sent);
      sendNotifications(summary, roles, channel);
      sendPush(summary, roles, channel);
    }

    setUploadProgress(null);
    setSending(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Vor dem await zuruecksetzen, sonst laesst sich dieselbe Datei nicht
    // direkt noch einmal auswaehlen
    e.target.value = "";
    if (files.length === 0) return;
    await uploadAndSendFiles(files);
  };

  // Strg+V: Bilder aus Zwischenablage einfuegen (Screenshots, Excel-Auszuege)
  const handlePasteImage = async (file: File) => {
    const renamed = new File([file], `clipboard_${Date.now()}.${(file.type.split("/")[1] || "png")}`, { type: file.type });
    await uploadAndSendFiles([renamed]);
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

                  {/* Anhang: Bild, Video oder PDF */}
                  {msg.image_url && (() => {
                    const kind = attachmentKindFromUrl(msg.image_url);
                    if (kind === "video") {
                      // preload="metadata": nur das Vorschaubild laden, nicht das
                      // ganze Video - wichtig bei Mobilfunk auf der Baustelle
                      return (
                        <video
                          src={msg.image_url}
                          controls
                          playsInline
                          preload="metadata"
                          className="rounded-lg max-w-full max-h-64 mb-1 bg-black"
                        />
                      );
                    }
                    if (kind === "pdf") {
                      return (
                        <a
                          href={msg.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 mb-1 rounded-lg bg-background/50 border border-border hover:bg-background/80 transition-colors"
                        >
                          <FileText className="h-8 w-8 shrink-0 text-red-600" />
                          <div className="text-left min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{msg.message || "PDF-Dokument"}</p>
                            <p className="text-xs text-muted-foreground">Zum Anzeigen tippen</p>
                          </div>
                        </a>
                      );
                    }
                    return (
                      <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={msg.image_url}
                          alt="Foto"
                          className="rounded-lg max-w-full max-h-64 object-cover mb-1 cursor-pointer hover:opacity-90"
                        />
                      </a>
                    );
                  })()}

                  {/* Text - bei PDF/Video ist der Dateiname keine echte Nachricht */}
                  {msg.message &&
                    !(msg.image_url && attachmentKindFromUrl(msg.image_url) !== "image") && (
                      <p className="text-sm whitespace-pre-wrap break-words">{formatChatText(msg.message)}</p>
                    )}

                  {/* Timestamp + Lesebestaetigung (nur Absender und Admins) */}
                  <p className={`text-[10px] mt-0.5 text-right flex items-center justify-end gap-1 ${isOwn ? "opacity-70" : "text-muted-foreground"}`}>
                    {formatTime(msg.created_at)}
                    <ReadReceipt
                      visible={isOwn || isAdmin}
                      reads={reads.filter((r) => r.message_id === msg.id)}
                      recipients={channelMembers.filter((m) => m.id !== msg.user_id)}
                    />
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
        {uploadProgress && (
          <p className="text-xs text-muted-foreground mb-2 text-center">
            Sende Datei {Math.min(uploadProgress.done + 1, uploadProgress.total)} von{" "}
            {uploadProgress.total}...
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={CHAT_FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            title="Dateien senden (Bilder, Videos, PDF)"
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
            multiline
            rows={1}
            inputClassName="min-h-[40px] max-h-32 resize-none"
            onKeyDown={handleChatInputKeyDown(handleSend)}
            onPasteImage={handlePasteImage}
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
