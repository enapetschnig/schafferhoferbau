import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera, Send, ChevronUp, Trash2, X, ChevronLeft, ChevronRight, Download, Pencil } from "lucide-react";
import { ImageEditor } from "@/components/ImageEditor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ChatMessage = {
  id: string;
  project_id: string;
  user_id: string;
  message: string | null;
  image_url: string | null;
  created_at: string;
  sender_name?: string;
};

type Reaction = { id: string; message_id: string; user_id: string; emoji: string };

const QUICK_EMOJIS = ["👍", "❤️", "✅", "👏", "🔥"];

const PAGE_SIZE = 50;

export function ProjectChat({ projectId, projectName, isAdmin }: { projectId: string; projectName?: string; isAdmin?: boolean }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Fetch profile name helper
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

  // Enrich messages with sender names
  const enrichMessages = async (msgs: ChatMessage[]): Promise<ChatMessage[]> => {
    const enriched = await Promise.all(
      msgs.map(async (msg) => ({
        ...msg,
        sender_name: await getProfileName(msg.user_id),
      }))
    );
    return enriched;
  };

  // Initial load
  useEffect(() => {
    if (!projectId) return;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("project_messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        console.error("Error loading messages:", error);
        return;
      }

      const reversed = (data || []).reverse();
      const enriched = await enrichMessages(reversed);
      setMessages(enriched);
      setHasMore((data || []).length === PAGE_SIZE);
      setInitialLoad(false);

      // Reaktionen laden
      const msgIds = (data || []).map((m: any) => m.id);
      if (msgIds.length > 0) {
        const { data: reactData } = await supabase
          .from("message_reactions")
          .select("*")
          .in("message_id", msgIds);
        if (reactData) setReactions(reactData as Reaction[]);
      }
    };

    loadMessages();
  }, [projectId]);

  // Realtime subscription
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`project-chat-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_messages",
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          // Don't add if already exists (from optimistic update)
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return prev; // Will be added below after enrichment
          });
          const enriched = await enrichMessages([newMsg]);
          setMessages(prev => {
            if (prev.some(m => m.id === enriched[0].id)) return prev;
            return [...prev, enriched[0]];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "project_messages",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

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
      .from("project_messages")
      .select("*")
      .eq("project_id", projectId)
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
    setMessages(prev => [...enriched, ...prev]);
    setHasMore((data || []).length === PAGE_SIZE);
    setLoadingMore(false);
  };

  // Send notifications to project members
  const sendNotifications = async (messagePreview: string) => {
    if (!currentUserId) return;
    const { data: accessData } = await supabase
      .from("project_access")
      .select("user_id")
      .eq("project_id", projectId);

    const recipients = (accessData || [])
      .map(a => a.user_id)
      .filter(uid => uid !== currentUserId);

    if (recipients.length > 0) {
      await supabase.from("notifications").insert(
        recipients.map(uid => ({
          user_id: uid,
          created_by: currentUserId,
          type: "chat_message",
          title: `Neue Nachricht${projectName ? ` in ${projectName}` : ""}`,
          message: messagePreview,
          metadata: { project_id: projectId },
        }))
      );

      // Send push notifications (fire-and-forget)
      supabase.functions.invoke("send-push", {
        body: {
          user_ids: recipients,
          title: projectName ? `Chat: ${projectName}` : "Projekt-Chat",
          body: messagePreview,
          url: `/projects/${projectId}/chat`,
        },
      });
    }
  };

  // Delete message (admin only)
  const handleDeleteMessage = async (msgId: string) => {
    const { error } = await supabase.from("project_messages").delete().eq("id", msgId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    }
  };

  // Send text message
  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !currentUserId || sending) return;

    setSending(true);
    setNewMessage("");

    const { error } = await supabase.from("project_messages").insert({
      project_id: projectId,
      user_id: currentUserId,
      message: text,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Nachricht konnte nicht gesendet werden" });
      setNewMessage(text); // Restore message
    } else {
      // Notify project members (fire-and-forget)
      sendNotifications(text.substring(0, 100));
    }
    setSending(false);
  };

  // Bearbeitetes Bild als neue Nachricht speichern
  const handleEditedImageSave = async (blob: Blob) => {
    if (!currentUserId) {
      toast({ variant: "destructive", title: "Nicht angemeldet" });
      throw new Error("not authenticated");
    }
    const fileName = `edited_${Date.now()}.jpg`;
    const filePath = `${projectId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("project-chat")
      .upload(filePath, blob, { cacheControl: "3600", contentType: "image/jpeg" });

    if (uploadError) {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: uploadError.message });
      throw uploadError;
    }

    const { data: urlData } = supabase.storage.from("project-chat").getPublicUrl(filePath);

    const { error: msgError } = await supabase.from("project_messages").insert({
      project_id: projectId,
      user_id: currentUserId,
      image_url: urlData.publicUrl,
      message: "✏️ Bearbeitet",
    });

    if (msgError) {
      toast({ variant: "destructive", title: "Nachricht konnte nicht gesendet werden", description: msgError.message });
      throw msgError;
    }

    toast({ title: "Bearbeitetes Bild geteilt" });
    setEditingImage(null);
    setPreviewImage(null);
  };

  // Send photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    setSending(true);
    const filePath = `${projectId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("project-chat")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: uploadError.message });
      setSending(false);
      return;
    }

    // Also save to project-photos bucket
    const photosPath = `${projectId}/${Date.now()}_${file.name}`;
    await supabase.storage
      .from("project-photos")
      .upload(photosPath, file, { cacheControl: "3600", upsert: false });

    const { data: urlData } = supabase.storage
      .from("project-chat")
      .getPublicUrl(filePath);

    const { error } = await supabase.from("project_messages").insert({
      project_id: projectId,
      user_id: currentUserId,
      image_url: urlData.publicUrl,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Foto konnte nicht gesendet werden" });
    } else {
      // Notify project members (fire-and-forget)
      sendNotifications("📷 Foto gesendet");
    }

    setSending(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  // Group messages by date
  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Heute";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Gestern";
    return d.toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long" });
  };

  // Determine if we should show a date separator
  const shouldShowDate = (index: number) => {
    if (index === 0) return true;
    const curr = new Date(messages[index].created_at).toDateString();
    const prev = new Date(messages[index - 1].created_at).toDateString();
    return curr !== prev;
  };

  // Should show sender name (first message or different sender than previous)
  const shouldShowSender = (index: number) => {
    if (index === 0) return true;
    const curr = messages[index];
    const prev = messages[index - 1];
    if (curr.user_id !== prev.user_id) return true;
    // Show name if more than 5 minutes gap
    const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    return gap > 5 * 60 * 1000;
  };

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chat wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
      >
        {/* Load more button */}
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
          const showDate = shouldShowDate(index);
          const showSender = shouldShowSender(index);

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {showDate && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
                    {getDateLabel(msg.created_at)}
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${showSender ? "mt-2" : "mt-0.5"} group`}>
                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 py-2 relative ${
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  }`}
                >
                  {/* Sender name */}
                  {showSender && !isOwn && (
                    <p className="text-xs font-semibold mb-0.5 opacity-80">
                      {msg.sender_name}
                    </p>
                  )}

                  {/* Image - klickbar fuer Vollbild-Vorschau */}
                  {msg.image_url && (
                    <img
                      src={msg.image_url}
                      alt="Foto"
                      className="rounded-lg max-w-full max-h-64 object-cover mb-1 cursor-pointer hover:opacity-90"
                      onClick={(e) => { e.stopPropagation(); setPreviewImage(msg.image_url); }}
                    />
                  )}

                  {/* Text */}
                  {msg.message && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  )}

                  {/* Emoji-Reaktionen */}
                  {(() => {
                    const msgReactions = reactions.filter(r => r.message_id === msg.id);
                    const grouped: Record<string, string[]> = {};
                    msgReactions.forEach(r => {
                      if (!grouped[r.emoji]) grouped[r.emoji] = [];
                      grouped[r.emoji].push(r.user_id);
                    });
                    return (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(grouped).map(([emoji, userIds]) => (
                          <button
                            key={emoji}
                            className={`text-xs px-1.5 py-0.5 rounded-full border ${
                              currentUserId && userIds.includes(currentUserId)
                                ? "bg-primary/20 border-primary/40"
                                : "bg-muted/50 border-muted-foreground/20"
                            } hover:bg-primary/30`}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!currentUserId) return;
                              if (userIds.includes(currentUserId)) {
                                const r = msgReactions.find(r => r.emoji === emoji && r.user_id === currentUserId);
                                if (r) {
                                  await supabase.from("message_reactions").delete().eq("id", r.id);
                                  setReactions(prev => prev.filter(p => p.id !== r.id));
                                }
                              } else {
                                const { data } = await supabase.from("message_reactions").insert({
                                  message_id: msg.id, user_id: currentUserId, emoji
                                }).select().single();
                                if (data) setReactions(prev => [...prev, data as Reaction]);
                              }
                            }}
                          >
                            {emoji} {userIds.length > 1 ? userIds.length : ""}
                          </button>
                        ))}
                        <button
                          className="text-xs px-1.5 py-0.5 rounded-full border border-dashed border-muted-foreground/30 hover:bg-muted/50 text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id); }}
                        >
                          +
                        </button>
                        {showEmojiPicker === msg.id && (
                          <div className="flex gap-1 p-1 bg-card rounded-lg border shadow-lg">
                            {QUICK_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                className="text-lg hover:scale-125 transition-transform px-0.5"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!currentUserId) return;
                                  const existing = msgReactions.find(r => r.emoji === emoji && r.user_id === currentUserId);
                                  if (existing) {
                                    await supabase.from("message_reactions").delete().eq("id", existing.id);
                                    setReactions(prev => prev.filter(p => p.id !== existing.id));
                                  } else {
                                    const { data } = await supabase.from("message_reactions").insert({
                                      message_id: msg.id, user_id: currentUserId, emoji
                                    }).select().single();
                                    if (data) setReactions(prev => [...prev, data as Reaction]);
                                  }
                                  setShowEmojiPicker(null);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Nachricht schreiben..."
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

      {/* Bild-Vorschau Lightbox */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 bg-black/95">
          <div className="flex justify-between items-center px-4 py-2">
            <span className="text-white text-sm">Bild-Vorschau</span>
            <div className="flex gap-2">
              {previewImage && (
                <>
                  <button
                    onClick={() => setEditingImage(previewImage)}
                    className="text-white hover:text-gray-300 flex items-center gap-1 px-2 py-1 bg-white/10 rounded"
                    title="Bild bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="text-xs hidden sm:inline">Bearbeiten</span>
                  </button>
                  <a href={previewImage} download className="text-white hover:text-gray-300">
                    <Download className="h-5 w-5" />
                  </a>
                </>
              )}
              <button onClick={() => setPreviewImage(null)} className="text-white hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {previewImage && (
              <img src={previewImage} alt="Vorschau" className="max-w-full max-h-full object-contain rounded-lg" />
            )}
          </div>
          {/* Swipe durch Chat-Bilder */}
          {(() => {
            const allImages = messages.filter(m => m.image_url).map(m => m.image_url!);
            const currentIdx = previewImage ? allImages.indexOf(previewImage) : -1;
            if (allImages.length <= 1) return null;
            return (
              <div className="flex justify-center gap-4 pb-4">
                <button
                  className="text-white hover:text-gray-300 disabled:opacity-30"
                  disabled={currentIdx <= 0}
                  onClick={() => setPreviewImage(allImages[currentIdx - 1])}
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <span className="text-white text-sm self-center">{currentIdx + 1} / {allImages.length}</span>
                <button
                  className="text-white hover:text-gray-300 disabled:opacity-30"
                  disabled={currentIdx >= allImages.length - 1}
                  onClick={() => setPreviewImage(allImages[currentIdx + 1])}
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Image Editor */}
      {editingImage && (
        <ImageEditor
          open={!!editingImage}
          onClose={() => setEditingImage(null)}
          imageUrl={editingImage}
          onSave={handleEditedImageSave}
          title="Bild bearbeiten und teilen"
        />
      )}
    </div>
  );
}
