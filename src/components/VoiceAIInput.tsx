import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type VoiceAIContext =
  | "tagesbericht"
  | "regiebericht"
  | "zeiterfassung"
  | "notiz"
  | "bestellung"
  | "anmerkung"
  | "default";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  context?: VoiceAIContext;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Wenn gesetzt: Buttons ueber dem Feld statt rechts */
  buttonsPosition?: "inline" | "above";
  /** Nur Mic anzeigen */
  voiceOnly?: boolean;
  /** Nur AI anzeigen */
  aiOnly?: boolean;
}

/**
 * Eingabefeld mit zwei Zusatz-Buttons:
 * - Mic: Sprache aufnehmen -> Whisper -> Text einfuegen
 * - Sparkles: Text mit KI verbessern (kontext-sensitiv)
 */
export function VoiceAIInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 3,
  context = "default",
  disabled,
  className,
  inputClassName,
  buttonsPosition = "inline",
  voiceOnly = false,
  aiOnly = false,
}: Props) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [improving, setImproving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cleanupStream();
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 500) {
          toast({ variant: "destructive", title: "Aufnahme zu kurz", description: "Bitte etwas länger sprechen." });
          return;
        }
        await transcribe(blob, recorder.mimeType);
      };

      recorder.start();
      setRecording(true);
    } catch (err: any) {
      cleanupStream();
      toast({
        variant: "destructive",
        title: "Mikrofon-Zugriff verweigert",
        description: err.message || "Bitte Mikrofonberechtigung im Browser erlauben.",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const transcribe = async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
    try {
      // Blob -> base64
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onerror = reject;
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || "");
        };
        reader.readAsDataURL(blob);
      });

      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: {
          audio: base64,
          mimeType,
          context: value.slice(-200),
        },
      });
      if (error) throw error;
      const newText = (data as any)?.text || "";
      if (!newText.trim()) {
        toast({ variant: "destructive", title: "Keine Sprache erkannt", description: "Bitte nochmal versuchen." });
        return;
      }
      // An bestehenden Text anhaengen (mit Trennzeichen)
      const combined = value.trim()
        ? `${value.trim()} ${newText.trim()}`
        : newText.trim();
      onChange(combined);
      toast({ title: "Aufnahme übernommen" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Transkription fehlgeschlagen", description: err.message });
    } finally {
      setTranscribing(false);
    }
  };

  const improve = async () => {
    if (!value.trim()) {
      toast({ title: "Nichts zu verbessern", description: "Bitte erst Text eingeben oder diktieren." });
      return;
    }
    setImproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("improve-text", {
        body: { text: value, context },
      });
      if (error) throw error;
      const improved = (data as any)?.text || value;
      onChange(improved);
      toast({ title: "Text verbessert" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "KI-Verbesserung fehlgeschlagen", description: err.message });
    } finally {
      setImproving(false);
    }
  };

  const showMic = !aiOnly;
  const showAI = !voiceOnly;

  const buttons = (
    <div className="flex gap-1 shrink-0">
      {showMic && (
        <Button
          type="button"
          size="icon"
          variant={recording ? "destructive" : "outline"}
          className="h-9 w-9"
          disabled={disabled || transcribing || improving}
          onClick={recording ? stopRecording : startRecording}
          title={recording ? "Aufnahme stoppen" : "Sprache aufnehmen"}
        >
          {transcribing
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : recording
            ? <MicOff className="h-4 w-4" />
            : <Mic className="h-4 w-4" />}
        </Button>
      )}
      {showAI && (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9"
          disabled={disabled || improving || transcribing || recording || !value.trim()}
          onClick={improve}
          title="Text mit KI verbessern"
        >
          {improving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );

  // autoComplete="off" verhindert Browser-Autofill mit zufaellig uebernommenen
  // Texten aus anderen Feldern (z.B. Tagesbericht-Beschreibung → Taetigkeit)
  const inputElement = multiline ? (
    <Textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      className={cn("flex-1", inputClassName)}
    />
  ) : (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      className={cn("flex-1", inputClassName)}
    />
  );

  if (buttonsPosition === "above") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex justify-end">{buttons}</div>
        {inputElement}
      </div>
    );
  }

  if (multiline) {
    return (
      <div className={cn("relative", className)}>
        {inputElement}
        <div className="absolute top-1.5 right-1.5">{buttons}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 items-center", className)}>
      {inputElement}
      {buttons}
    </div>
  );
}
