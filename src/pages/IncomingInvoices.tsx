import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DocumentDetailDialog, type IncomingDocument } from "@/components/DocumentDetailDialog";
import { BatchInvoiceProcessor } from "@/components/BatchInvoiceProcessor";
import { Layers } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, Filter, FileText, Check, CheckCircle2, AlertTriangle, XCircle, Loader2, X, Plus, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx-js-style";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const prepareFileForAI = (file: File): Promise<{ base64: string; mimeType: string; pdfText?: string }> =>
  new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument({ data }).promise;

          // Zuerst Textlayer versuchen (eingebetteter Text = perfekte Extraktion)
          const pageTexts: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            pageTexts.push(`--- Seite ${i} ---\n${pageText}`);
          }
          const fullText = pageTexts.join("\n\n");

          if (fullText.trim().length > 100) {
            // PDF hat Textlayer → als Text senden (wie ChatGPT, 100% genau)
            resolve({ base64: "", mimeType: "application/pdf", pdfText: fullText });
            return;
          }

          // Kein Textlayer (gescannte PDF) → Fallback: kombiniertes JPEG
          const pageCanvases: HTMLCanvasElement[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
            pageCanvases.push(canvas);
          }
          const totalW = pageCanvases[0].width;
          const totalH = pageCanvases.reduce((s, c) => s + c.height, 0);
          const combined = document.createElement("canvas");
          combined.width = totalW;
          combined.height = totalH;
          const ctx = combined.getContext("2d")!;
          let y = 0;
          for (const pc of pageCanvases) { ctx.drawImage(pc, 0, y); y += pc.height; }
          let w = combined.width, h = combined.height;
          if (w > 1400) { h = Math.round(h * 1400 / w); w = 1400; }
          if (h > 5000) { w = Math.round(w * 5000 / h); h = 5000; }
          const out = document.createElement("canvas");
          out.width = w; out.height = h;
          out.getContext("2d")!.drawImage(combined, 0, 0, w, h);
          const dataUrl = out.toDataURL("image/jpeg", 0.75);
          resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > 1500) { h = Math.round(h * 1500 / w); w = 1500; }
          if (h > 1500) { w = Math.round(w * 1500 / h); h = 1500; }
          const out = document.createElement("canvas");
          out.width = w; out.height = h;
          out.getContext("2d")!.drawImage(img, 0, 0, w, h);
          const dataUrl = out.toDataURL("image/jpeg", 0.85);
          resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    }
  });

const monthNames = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  offen: { label: "Offen", color: "bg-red-100 text-red-800" },
  bezahlt: { label: "Bezahlt", color: "bg-green-100 text-green-800" },
  storniert: { label: "Storniert", color: "bg-gray-100 text-gray-800" },
};

type AIMatchResult = {
  matches: Array<{
    lieferschein_index: number;
    rechnung_index: number;
    status: "match" | "menge_abweichung" | "kein_match";
    bemerkung: string;
  }>;
  nur_in_rechnung: Array<{ rechnung_index: number; material: string; hinweis: string }>;
  nur_im_lieferschein: Array<{ lieferschein_index: number; material: string; hinweis: string }>;
  zusammenfassung: string;
  match_score: number;
};

type MatchResult = {
  status: "match" | "mismatch" | "none";
  lieferscheinId?: string;
  lieferscheinBetrag?: number;
};

type ExtractedData = {
  lieferant: string | null;
  datum: string | null;
  belegnummer: string | null;
  betrag: number | null;
  preistyp: string | null;
  positionen: { material: string; menge: string; einheit: string; einzelpreis: string | null; gesamtpreis: string | null }[];
  qualitaet: string;
};


export default function IncomingInvoices() {
  const { toast } = useToast();
  const now = new Date();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rechnungen tab state
  const [invoices, setInvoices] = useState<IncomingDocument[]>([]);
  const [lieferscheine, setLieferscheine] = useState<IncomingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState("alle");
  const [filterLieferant, setFilterLieferant] = useState("");
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());

  // Detail dialog
  const [selectedDoc, setSelectedDoc] = useState<IncomingDocument | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [bulkZipping, setBulkZipping] = useState(false);

  // Upload tab state
  const [dragOver, setDragOver] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [editLieferant, setEditLieferant] = useState("");
  const [editDatum, setEditDatum] = useState("");
  const [editBelegnummer, setEditBelegnummer] = useState("");
  const [editBetrag, setEditBetrag] = useState("");
  const [editBetragNetto, setEditBetragNetto] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editPositionen, setEditPositionen] = useState<{ material: string; menge: string; einheit: string; einzelpreis: string; gesamtpreis: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Abgleich tab state
  const [abgleichLSIds, setAbgleichLSIds] = useState<Set<string>>(new Set());
  const [abgleichREId, setAbgleichREId] = useState("");
  const [matchesSaving, setMatchesSaving] = useState(false);
  const [aiMatchResult, setAiMatchResult] = useState<AIMatchResult | null>(null);
  const [aiMatchLoading, setAiMatchLoading] = useState(false);

  // Lieferscheine tab filter state
  const [filterLieferantLS, setFilterLieferantLS] = useState("");
  const [filterTypLS, setFilterTypLS] = useState("alle");

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const filteredLieferscheine = lieferscheine.filter((d) => {
    const matchTyp = filterTypLS === "alle" || d.typ === filterTypLS;
    const matchLieferant = !filterLieferantLS || (d.lieferant || "").toLowerCase().includes(filterLieferantLS.toLowerCase());
    return matchTyp && matchLieferant;
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterYear]);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);

    const startDate = new Date(filterYear, filterMonth - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(filterYear, filterMonth, 0).toISOString().split("T")[0];

    // Fetch invoices (typ = 'rechnung')
    const { data: invData, error: invError } = await supabase
      .from("incoming_documents")
      .select("*, projects(name)")
      .eq("typ", "rechnung")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .order("created_at", { ascending: false });

    // Fetch lieferscheine for matching
    const { data: lsData } = await supabase
      .from("incoming_documents")
      .select("*, projects(name)")
      .in("typ", ["lieferschein", "lagerlieferschein"])
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    if (invError) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnungen konnten nicht geladen werden" });
      setLoading(false);
      return;
    }

    // Fetch employee names for invoices
    if (invData) {
      const userIds = [...new Set(invData.map((d: any) => d.user_id))];
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .in("user_id", userIds);

      const nameMap: Record<string, string> = {};
      empData?.forEach((e: any) => {
        if (e.user_id) nameMap[e.user_id] = `${e.vorname} ${e.nachname}`.trim();
      });

      setInvoices(
        invData.map((d: any) => ({
          ...d,
          project_name: d.projects?.name || "–",
          employee_name: nameMap[d.user_id] || "–",
        }))
      );
    }

    if (lsData) {
      const lsUserIds = [...new Set(lsData.map((d: any) => d.user_id))];
      const { data: lsEmpData } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .in("user_id", lsUserIds);
      const lsNameMap: Record<string, string> = {};
      lsEmpData?.forEach((e: any) => {
        if (e.user_id) lsNameMap[e.user_id] = `${e.vorname} ${e.nachname}`.trim();
      });

      setLieferscheine(
        lsData.map((d: any) => ({
          ...d,
          project_name: d.projects?.name || "–",
          employee_name: lsNameMap[d.user_id] || null,
        }))
      );
    }

    setLoading(false);
  }, [filterMonth, filterYear]);

  // Match invoice against Lieferscheine
  const getMatch = (invoice: IncomingDocument): MatchResult => {
    if (!invoice.lieferant) return { status: "none" };

    const matches = lieferscheine.filter((ls) => {
      // Match by lieferant (case-insensitive substring)
      const lieferantMatch =
        ls.lieferant &&
        invoice.lieferant &&
        ls.lieferant.toLowerCase().includes(invoice.lieferant.toLowerCase().substring(0, 5));
      // Match by project
      const projectMatch = ls.project_id === invoice.project_id;
      return lieferantMatch && projectMatch;
    });

    if (matches.length === 0) return { status: "none" };

    // Check if any match has similar betrag (±5%)
    const invBetrag = Number(invoice.betrag) || 0;
    for (const ls of matches) {
      const lsBetrag = Number(ls.betrag) || 0;
      if (invBetrag === 0 && lsBetrag === 0) {
        return { status: "match", lieferscheinId: ls.id, lieferscheinBetrag: lsBetrag };
      }
      if (invBetrag > 0) {
        const diff = Math.abs(invBetrag - lsBetrag) / invBetrag;
        if (diff <= 0.05) {
          return { status: "match", lieferscheinId: ls.id, lieferscheinBetrag: lsBetrag };
        }
        return { status: "mismatch", lieferscheinId: ls.id, lieferscheinBetrag: lsBetrag };
      }
    }

    return { status: "mismatch", lieferscheinId: matches[0].id, lieferscheinBetrag: Number(matches[0].betrag) || 0 };
  };

  // Apply filters
  const filtered = invoices.filter((inv) => {
    if (filterStatus !== "alle" && inv.status !== filterStatus) return false;
    if (filterLieferant && inv.lieferant && !inv.lieferant.toLowerCase().includes(filterLieferant.toLowerCase())) return false;
    if (filterLieferant && !inv.lieferant) return false;
    return true;
  });

  // Stats
  const offeneCount = invoices.filter((d) => d.status === "offen").length;
  const offeneSumme = invoices
    .filter((d) => d.status === "offen" && d.betrag)
    .reduce((sum, d) => sum + Number(d.betrag), 0);
  const matchedCount = invoices.filter((inv) => getMatch(inv).status === "match").length;

  // ZIP-Sammel-Download der ausgewaehlten Rechnungen (Original-PDFs/Bilder)
  const handleBulkZipDownload = async () => {
    if (selectedInvoiceIds.size === 0) return;
    setBulkZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const chosen = invoices.filter((inv) => selectedInvoiceIds.has(inv.id));
      // Alle Download-Tasks flach sammeln und parallel ziehen — massiv schneller
      // als die bisherige sequentielle For-Schleife (oft 10x+ schneller im WLAN)
      type Task = { url: string; fileName: string };
      const tasks: Task[] = [];
      for (const inv of chosen) {
        const files = [inv.photo_url, ...(inv.zusatz_seiten_urls || [])].filter(Boolean) as string[];
        const base = [
          (inv.dokument_datum || inv.created_at).slice(0, 10),
          (inv.lieferant || "Lieferant").replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_"),
          (inv.dokument_nummer || inv.id.slice(0, 6)).replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, "_"),
        ].join("_");
        files.forEach((url, i) => {
          const ext = url.split(".").pop()?.split("?")[0] || "pdf";
          const fileName = files.length === 1 ? `${base}.${ext}` : `${base}_seite${i + 1}.${ext}`;
          tasks.push({ url, fileName });
        });
      }
      let failedCount = 0;
      const results = await Promise.allSettled(
        tasks.map(async (t) => {
          const resp = await fetch(t.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return { fileName: t.fileName, blob: await resp.blob() };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          zip.file(r.value.fileName, r.value.blob);
        } else {
          failedCount++;
          console.warn("ZIP-Entry fehlgeschlagen:", r.reason);
        }
      }
      if (failedCount === tasks.length) {
        toast({ variant: "destructive", title: "Keine Datei konnte geladen werden" });
        return;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Rechnungen_${monthNames[filterMonth - 1]}_${filterYear}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({
        title: `${chosen.length} Rechnungen als ZIP heruntergeladen`,
        description: failedCount > 0 ? `${failedCount} Datei(en) konnten nicht geladen werden` : undefined,
      });
      setSelectedInvoiceIds(new Set());
    } catch (err: any) {
      toast({ variant: "destructive", title: "ZIP-Export fehlgeschlagen", description: err?.message });
    } finally {
      setBulkZipping(false);
    }
  };

  const toggleInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllInvoices = () => {
    setSelectedInvoiceIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((inv) => inv.id));
    });
  };

  // Excel export
  const exportToExcel = () => {
    const rows: (string | number)[][] = [
      ["Eingangsrechnungen", "", "", "", "", "", "", ""],
      [`${monthNames[filterMonth - 1]} ${filterYear}`, "", "", "", "", "", "", ""],
      [],
      ["Datum", "Lieferant", "Belegnr.", "Projekt", "Betrag", "Abgleich", "Status", "Mitarbeiter"],
    ];

    for (const inv of filtered) {
      const match = getMatch(inv);
      let abgleichText = "Kein Lieferschein";
      if (match.status === "match") abgleichText = "Abgeglichen";
      if (match.status === "mismatch") abgleichText = `Abweichung (LS: € ${match.lieferscheinBetrag?.toFixed(2)})`;

      rows.push([
        inv.dokument_datum ? format(parseISO(inv.dokument_datum), "dd.MM.yyyy") : "–",
        inv.lieferant || "–",
        inv.dokument_nummer || "–",
        inv.project_name || "–",
        inv.betrag != null ? Number(inv.betrag).toFixed(2).replace(".", ",") : "0,00",
        abgleichText,
        STATUS_LABELS[inv.status]?.label || inv.status,
        inv.employee_name || "–",
      ]);
    }

    rows.push([]);
    rows.push(["", "", "", "GESAMT", filtered.reduce((s, d) => s + (d.betrag ? Number(d.betrag) : 0), 0).toFixed(2).replace(".", ","), "", "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Eingangsrechnungen");
    XLSX.writeFile(wb, `Eingangsrechnungen_${monthNames[filterMonth - 1]}_${filterYear}.xlsx`);
    toast({ title: "Exportiert", description: "Excel-Datei wurde heruntergeladen" });
  };

  // --- Upload tab logic ---
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleFileSelected = (file: File) => {
    setUploadFile(file);
    setExtracted(null);
    setEditLieferant("");
    setEditDatum("");
    setEditBelegnummer("");
    setEditBetrag("");
    setEditProjectId("");
    setEditPositionen([]);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setUploadPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setUploadPreview(null);
    }
  };

  const handleExtract = async () => {
    if (!uploadFile) return;
    setExtracting(true);

    try {
      // Upload file to storage first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht eingeloggt");

      const filePath = `temp/${user.id}/${Date.now()}_${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("incoming-documents")
        .upload(filePath, uploadFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("incoming-documents")
        .getPublicUrl(filePath);

      // Prepare file for AI: PDF mit Textlayer → pdfText, sonst JPEG
      const prepared = await prepareFileForAI(uploadFile);
      const invokeBody = prepared.pdfText
        ? { pdfText: prepared.pdfText }
        : { imageBase64: prepared.base64, mediaType: prepared.mimeType };

      // Call extract-document edge function (SDK handles auth automatically)
      const { data, error: fnError } = await supabase.functions.invoke("extract-document", {
        body: invokeBody,
      });

      if (fnError) {
        let errMsg = fnError.message;
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) errMsg = body.error;
          if (body?.details) errMsg += " — " + body.details;
        } catch {}
        throw new Error(errMsg);
      }

      setExtracted(data);
      setEditLieferant(data["Lieferant"] || "");
      setEditDatum(data["Datum"] || "");
      setEditBelegnummer(data["Belegnummer"] || "");
      setEditBetrag(data["Betrag Brutto (€)"] != null && data["Betrag Brutto (€)"] !== "" && data["Betrag Brutto (€)"] !== "nicht gefunden"
        ? String(data["Betrag Brutto (€)"]) : "");
      setEditBetragNetto(data["Betrag Netto (€)"] != null && data["Betrag Netto (€)"] !== "" && data["Betrag Netto (€)"] !== "nicht gefunden"
        ? String(data["Betrag Netto (€)"]) : "");
      setEditPositionen((data["Positionen"] || []).map((p: any) => ({
        material: p["Material"] || "",
        menge: p["Menge"] != null ? String(p["Menge"]) : "",
        einheit: p["Einheit"] || "",
        einzelpreis: p["Einzelpreis (€ netto)"] != null ? String(p["Einzelpreis (€ netto)"]) : "",
        gesamtpreis: p["Gesamt (€ netto)"] != null ? String(p["Gesamt (€ netto)"]) : "",
      })));
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Extraktion fehlgeschlagen", description: (err as Error).message });
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (!uploadFile || !editProjectId) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte Projekt auswählen" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht eingeloggt");

      // Upload final file
      const filePath = `${user.id}/rechnungen/${Date.now()}_${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("incoming-documents")
        .upload(filePath, uploadFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("incoming-documents")
        .getPublicUrl(filePath);

      // Insert into incoming_documents
      const { error: insertError } = await supabase.from("incoming_documents").insert({
        project_id: editProjectId,
        user_id: user.id,
        typ: "rechnung",
        photo_url: urlData.publicUrl,
        lieferant: editLieferant || null,
        dokument_datum: editDatum || null,
        dokument_nummer: editBelegnummer || null,
        betrag: editBetrag ? parseFloat(editBetrag) : null,
        betrag_netto: editBetragNetto ? parseFloat(editBetragNetto) : null,
        positionen: editPositionen.map(p => ({
          material: p.material,
          menge: p.menge,
          einheit: p.einheit,
          einzelpreis: p.einzelpreis || null,
          gesamtpreis: p.gesamtpreis || null,
        })),
      });

      if (insertError) throw insertError;

      toast({ title: "Gespeichert", description: "Rechnung wurde erfolgreich erfasst" });

      // Reset upload form
      setUploadFile(null);
      setUploadPreview(null);
      setExtracted(null);
      setEditLieferant("");
      setEditDatum("");
      setEditBelegnummer("");
      setEditBetrag("");
      setEditBetragNetto("");
      setEditProjectId("");
      setEditPositionen([]);

      // Refresh list
      fetchData();
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Fehler", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };


  const selectedLSList = lieferscheine.filter((d) => abgleichLSIds.has(d.id));
  const selectedLS = selectedLSList[0] || null; // fuer Rueckwaertskompatibilitaet im Code unten
  const selectedRE = invoices.find((d) => d.id === abgleichREId);

  // Lade bestehende Matches aus DB wenn Rechnung ausgewaehlt
  useEffect(() => {
    if (!abgleichREId) {
      setAbgleichLSIds(new Set());
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("invoice_delivery_matches")
        .select("lieferschein_id")
        .eq("rechnung_id", abgleichREId);
      if (data) {
        setAbgleichLSIds(new Set(data.map((m: any) => m.lieferschein_id)));
      }
    })();
  }, [abgleichREId]);

  const toggleLSAssignment = async (lsId: string) => {
    if (!abgleichREId) return;
    setMatchesSaving(true);
    const isCurrentlyAssigned = abgleichLSIds.has(lsId);
    if (isCurrentlyAssigned) {
      // Entfernen
      await supabase.from("invoice_delivery_matches")
        .delete()
        .eq("rechnung_id", abgleichREId)
        .eq("lieferschein_id", lsId);
      setAbgleichLSIds(prev => {
        const next = new Set(prev);
        next.delete(lsId);
        return next;
      });
    } else {
      // Hinzufuegen
      await supabase.from("invoice_delivery_matches").insert({
        rechnung_id: abgleichREId,
        lieferschein_id: lsId,
      });
      setAbgleichLSIds(prev => new Set(prev).add(lsId));
    }
    setMatchesSaving(false);
    setAiMatchResult(null); // bei Aenderung KI neu laufen lassen
  };

  // Reset KI-Ergebnis bei Auswahlaenderung
  useEffect(() => {
    setAiMatchResult(null);
  }, [abgleichREId]);

  const runAIMatch = async () => {
    if (selectedLSList.length === 0 || !selectedRE) return;
    setAiMatchLoading(true);
    setAiMatchResult(null);
    try {
      // Alle Positionen der zugeordneten Lieferscheine zusammenfuegen
      const combinedPositionen: any[] = [];
      for (const ls of selectedLSList) {
        const pos = Array.isArray(ls.positionen) ? ls.positionen : [];
        for (const p of pos) {
          combinedPositionen.push({
            ...p,
            __ls_source: ls.dokument_nummer || ls.id.slice(0, 8),
          });
        }
      }
      const combinedLieferant = selectedLSList.map(ls => ls.lieferant).filter(Boolean).join(", ") || null;
      const { data, error } = await supabase.functions.invoke("compare-documents", {
        body: {
          lieferschein: {
            lieferant: combinedLieferant,
            positionen: combinedPositionen,
          },
          rechnung: {
            lieferant: selectedRE.lieferant,
            positionen: selectedRE.positionen,
          },
        },
      });
      if (error) throw error;
      if (data?.matches) {
        setAiMatchResult(data as AIMatchResult);
      } else {
        toast({ variant: "destructive", title: "Fehler", description: "KI-Antwort ungueltig" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "KI-Abgleich fehlgeschlagen", description: err.message });
    } finally {
      setAiMatchLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader title="Eingangsrechnungen" backPath="/" />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Rechnungen</CardDescription>
              <CardTitle className="text-2xl">{offeneCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Summe</CardDescription>
              <CardTitle className="text-2xl">&euro; {offeneSumme.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Abgeglichen</CardDescription>
              <CardTitle className="text-2xl text-green-600">{matchedCount} / {invoices.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="liste" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="liste" className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Rechnungen
            </TabsTrigger>
            <TabsTrigger value="lieferscheine" className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Lieferscheine
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Hochladen
            </TabsTrigger>
            <TabsTrigger value="abgleich" className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Abgleich
            </TabsTrigger>
          </TabsList>

          {/* Tab: Rechnungen Liste */}
          <TabsContent value="liste">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Filter className="w-5 h-5 text-muted-foreground shrink-0" />

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-[130px] h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle Status</SelectItem>
                        <SelectItem value="offen">Offen</SelectItem>
                        <SelectItem value="bezahlt">Bezahlt</SelectItem>
                        <SelectItem value="storniert">Storniert</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      placeholder="Lieferant..."
                      value={filterLieferant}
                      onChange={(e) => setFilterLieferant(e.target.value)}
                      className="w-[150px] h-10"
                    />

                    <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
                      <SelectTrigger className="w-[130px] h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {monthNames.map((name, i) => (
                          <SelectItem key={i} value={(i + 1).toString()}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
                      <SelectTrigger className="w-[100px] h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button variant="outline" onClick={() => setShowBatchDialog(true)}>
                    <Layers className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Mehrere analysieren</span>
                    <span className="sm:hidden">Batch</span>
                  </Button>
                  <Button variant="outline" onClick={exportToExcel} disabled={filtered.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Excel</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {selectedInvoiceIds.size > 0 && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg flex-wrap">
                    <Badge variant="secondary">{selectedInvoiceIds.size} ausgewählt</Badge>
                    <Button size="sm" onClick={handleBulkZipDownload} disabled={bulkZipping}>
                      {bulkZipping ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                      Als ZIP laden
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedInvoiceIds(new Set())} disabled={bulkZipping}>
                      Auswahl aufheben
                    </Button>
                  </div>
                )}
                {loading ? (
                  <p className="text-center py-8 text-muted-foreground">Lädt...</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Keine Rechnungen im ausgewählten Zeitraum</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={filtered.length > 0 && selectedInvoiceIds.size === filtered.length}
                              onCheckedChange={toggleAllInvoices}
                              aria-label="Alle auswählen"
                            />
                          </TableHead>
                          <TableHead>Datum</TableHead>
                          <TableHead>Lieferant</TableHead>
                          <TableHead className="hidden sm:table-cell">Belegnr.</TableHead>
                          <TableHead className="hidden md:table-cell">Projekt</TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                          <TableHead>Abgleich</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((inv) => {
                          const match = getMatch(inv);
                          const statusInfo = STATUS_LABELS[inv.status] || STATUS_LABELS.offen;

                          return (
                            <TableRow
                              key={inv.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => { setSelectedDoc(inv); setShowDetailDialog(true); }}
                            >
                              <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedInvoiceIds.has(inv.id)}
                                  onCheckedChange={() => toggleInvoice(inv.id)}
                                  aria-label={`Rechnung ${inv.lieferant || inv.id.slice(0, 6)} auswählen`}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {inv.dokument_datum
                                  ? format(parseISO(inv.dokument_datum), "dd.MM.yyyy")
                                  : format(new Date(inv.created_at), "dd.MM.yyyy")}
                              </TableCell>
                              <TableCell className="font-medium">{inv.lieferant || "–"}</TableCell>
                              <TableCell className="hidden sm:table-cell font-mono text-xs">{inv.dokument_nummer || "–"}</TableCell>
                              <TableCell className="hidden md:table-cell">{inv.project_name}</TableCell>
                              <TableCell className="text-right font-medium">
                                {inv.betrag != null ? `€ ${Number(inv.betrag).toFixed(2)}` : "–"}
                              </TableCell>
                              <TableCell>
                                {match.status === "match" && (
                                  <Badge className="bg-green-100 text-green-800 text-xs">
                                    <Check className="w-3 h-3 mr-1" /> Abgeglichen
                                  </Badge>
                                )}
                                {match.status === "mismatch" && (
                                  <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Abweichung
                                  </Badge>
                                )}
                                {match.status === "none" && (
                                  <Badge className="bg-red-100 text-red-800 text-xs">
                                    <XCircle className="w-3 h-3 mr-1" /> Kein LS
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusInfo.color + " text-xs"}>{statusInfo.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Upload */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>Rechnung hochladen</CardTitle>
                <CardDescription>
                  Laden Sie eine Rechnung hoch. Die KI extrahiert automatisch alle relevanten Daten.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!uploadFile ? (
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                      dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:bg-muted/50"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium">Rechnung hierher ziehen oder klicken</p>
                    <p className="text-sm text-muted-foreground mt-1">PDF, JPG, PNG (max. 50 MB)</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
                      <FileText className="w-8 h-8 text-purple-500" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{uploadFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setUploadFile(null); setUploadPreview(null); setExtracted(null); }}
                      >
                        Andere Datei
                      </Button>
                    </div>

                    {uploadPreview && (
                      <div className="border rounded-lg overflow-hidden max-h-64">
                        <img src={uploadPreview} alt="Vorschau" className="w-full object-contain max-h-64" />
                      </div>
                    )}

                    {!extracted && (
                      <Button onClick={handleExtract} disabled={extracting} className="w-full">
                        {extracting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            KI analysiert...
                          </>
                        ) : (
                          "KI-Extraktion starten"
                        )}
                      </Button>
                    )}

                    {extracted && (
                      <div className="space-y-4 border rounded-lg p-4">
                        <h3 className="font-semibold">Extrahierte Daten</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Lieferant</Label>
                            <Input value={editLieferant} onChange={(e) => setEditLieferant(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Datum</Label>
                            <Input type="date" value={editDatum} onChange={(e) => setEditDatum(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Belegnummer</Label>
                            <Input value={editBelegnummer} onChange={(e) => setEditBelegnummer(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Betrag Netto (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={editBetragNetto}
                              onChange={(e) => setEditBetragNetto(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Betrag Brutto (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={editBetrag}
                              onChange={(e) => setEditBetrag(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Projekt *</Label>
                          <Select value={editProjectId} onValueChange={setEditProjectId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Projekt auswählen..." />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Positionen ({editPositionen.length})</Label>
                            <Button size="sm" variant="outline" onClick={() =>
                              setEditPositionen([...editPositionen, { material: "", menge: "", einheit: "", einzelpreis: "", gesamtpreis: "" }])
                            }>
                              <Plus className="w-3 h-3 mr-1" /> Position hinzufügen
                            </Button>
                          </div>
                          <div className="overflow-x-auto border rounded-lg">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Material</TableHead>
                                  <TableHead className="w-16">Menge</TableHead>
                                  <TableHead className="w-16">Einheit</TableHead>
                                  <TableHead className="w-24">Einzelpreis (€ netto)</TableHead>
                                  <TableHead className="w-24">Gesamt (€ netto)</TableHead>
                                  <TableHead className="w-8"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {editPositionen.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-4">Keine Positionen</TableCell>
                                  </TableRow>
                                ) : editPositionen.map((pos, i) => (
                                  <TableRow key={i}>
                                    <TableCell>
                                      <Input value={pos.material} onChange={e => {
                                        const p = [...editPositionen]; p[i] = { ...p[i], material: e.target.value }; setEditPositionen(p);
                                      }} className="h-8 text-xs" />
                                    </TableCell>
                                    <TableCell>
                                      <Input value={pos.menge} onChange={e => {
                                        const p = [...editPositionen]; p[i] = { ...p[i], menge: e.target.value }; setEditPositionen(p);
                                      }} className="h-8 text-xs w-14" />
                                    </TableCell>
                                    <TableCell>
                                      <Input value={pos.einheit} onChange={e => {
                                        const p = [...editPositionen]; p[i] = { ...p[i], einheit: e.target.value }; setEditPositionen(p);
                                      }} className="h-8 text-xs w-14" />
                                    </TableCell>
                                    <TableCell>
                                      <Input value={pos.einzelpreis} onChange={e => {
                                        const p = [...editPositionen]; p[i] = { ...p[i], einzelpreis: e.target.value }; setEditPositionen(p);
                                      }} className="h-8 text-xs w-20" />
                                    </TableCell>
                                    <TableCell>
                                      <Input value={pos.gesamtpreis} onChange={e => {
                                        const p = [...editPositionen]; p[i] = { ...p[i], gesamtpreis: e.target.value }; setEditPositionen(p);
                                      }} className="h-8 text-xs w-20" />
                                    </TableCell>
                                    <TableCell>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() =>
                                        setEditPositionen(editPositionen.filter((_, j) => j !== i))
                                      }>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        <Button onClick={handleSaveInvoice} disabled={saving || !editProjectId} className="w-full">
                          {saving ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Wird gespeichert...
                            </>
                          ) : (
                            "Rechnung speichern"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
          {/* Tab: Abgleich */}
          <TabsContent value="abgleich">
            <Card>
              <CardHeader>
                <CardTitle>Lieferschein mit Rechnung abgleichen</CardTitle>
                <CardDescription>
                  Wählen Sie einen Lieferschein und eine Rechnung aus — die KI analysiert automatisch alle Unstimmigkeiten, auch wenn der Lieferant nicht übereinstimmt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Monatsfilter */}
                <div className="flex flex-wrap items-center gap-3">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
                    <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthNames.map((name, i) => (
                        <SelectItem key={i} value={(i + 1).toString()}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
                    <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rechnung auswählen */}
                <div className="space-y-2">
                  <Label>1. Rechnung auswählen</Label>
                  <Select value={abgleichREId} onValueChange={setAbgleichREId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Rechnung wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map((re) => (
                        <SelectItem key={re.id} value={re.id}>
                          {re.lieferant
                            ? `${re.lieferant} — ${re.dokument_nummer || re.id.slice(0, 8)} ${re.betrag != null ? `(€ ${Number(re.betrag).toFixed(2)})` : ""}`
                            : `Hochgeladen von ${re.employee_name || "Unbekannt"} am ${new Date(re.created_at).toLocaleDateString("de-AT")}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lieferscheine-Mehrfach-Zuordnung */}
                {abgleichREId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Label>2. Zugeordnete Lieferscheine ({abgleichLSIds.size})</Label>
                      {matchesSaving && <span className="text-xs text-muted-foreground">Speichert...</span>}
                    </div>
                    <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                      {lieferscheine.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3 text-center">Keine Lieferscheine im ausgewählten Zeitraum</p>
                      ) : (
                        lieferscheine.map((ls) => {
                          const isAssigned = abgleichLSIds.has(ls.id);
                          return (
                            <label
                              key={ls.id}
                              className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 ${isAssigned ? "bg-primary/5" : ""}`}
                            >
                              <Checkbox
                                checked={isAssigned}
                                onCheckedChange={() => toggleLSAssignment(ls.id)}
                                disabled={matchesSaving}
                              />
                              <div className="flex-1 min-w-0 text-sm">
                                <div className="font-medium truncate">
                                  {ls.lieferant || "Kein Lieferant"}
                                  {ls.dokument_nummer && <span className="text-muted-foreground font-normal"> · {ls.dokument_nummer}</span>}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {ls.dokument_datum ? format(parseISO(ls.dokument_datum), "dd.MM.yyyy") : format(new Date(ls.created_at), "dd.MM.yyyy")}
                                  {Array.isArray(ls.positionen) && ` · ${ls.positionen.length} Position${ls.positionen.length === 1 ? "" : "en"}`}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mehrere Lieferscheine einer Rechnung zuordnen. Beim KI-Abgleich werden alle Positionen der ausgewählten Lieferscheine zusammen verglichen.
                    </p>
                  </div>
                )}


                {/* Dokument-Vorschau */}
                {(selectedLS || selectedRE) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-muted-foreground">Lieferschein</h3>
                        {selectedLS?.photo_url && (
                          <a href={selectedLS.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            In neuem Tab oeffnen
                          </a>
                        )}
                      </div>
                      {selectedLS?.photo_url ? (
                        /\.pdf(\?|$)/i.test(selectedLS.photo_url) ? (
                          <iframe src={`${selectedLS.photo_url}#toolbar=1`} className="w-full h-[500px] rounded border" title="Lieferschein PDF" />
                        ) : (
                          <img src={selectedLS.photo_url} alt="Lieferschein" className="w-full rounded border object-contain max-h-[500px]" />
                        )
                      ) : selectedLS ? (
                        <div className="w-full h-40 rounded border flex items-center justify-center text-muted-foreground text-sm bg-muted/30">
                          Kein Originaldokument
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-muted-foreground">Rechnung</h3>
                        {selectedRE?.photo_url && (
                          <a href={selectedRE.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            In neuem Tab oeffnen
                          </a>
                        )}
                      </div>
                      {selectedRE?.photo_url ? (
                        /\.pdf(\?|$)/i.test(selectedRE.photo_url) ? (
                          <iframe src={`${selectedRE.photo_url}#toolbar=1`} className="w-full h-[500px] rounded border" title="Rechnung PDF" />
                        ) : (
                          <img src={selectedRE.photo_url} alt="Rechnung" className="w-full rounded border object-contain max-h-[500px]" />
                        )
                      ) : selectedRE ? (
                        <div className="w-full h-40 rounded border flex items-center justify-center text-muted-foreground text-sm bg-muted/30">
                          Kein Originaldokument
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* KI-Abgleich */}
                {selectedLSList.length > 0 && selectedRE && (
                  <div className="space-y-4">
                    {!aiMatchResult && (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-muted/40 rounded-lg border">
                        <div className="text-sm text-muted-foreground">
                          Die KI vergleicht die Positionen beider Dokumente und zeigt Übereinstimmungen, Abweichungen und fehlende Positionen an. Preise werden dabei nicht berücksichtigt.
                        </div>
                        <Button onClick={runAIMatch} disabled={aiMatchLoading} className="shrink-0">
                          {aiMatchLoading ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analysiere...</>
                          ) : (
                            <><Sparkles className="w-4 h-4 mr-2" />KI-Abgleich starten</>
                          )}
                        </Button>
                      </div>
                    )}

                    {aiMatchResult && (() => {
                      const lsPos: any[] = selectedLSList.flatMap((ls) => {
                        const arr: any[] = Array.isArray(ls.positionen) ? ls.positionen : [];
                        return arr.map(p => ({ ...p, __ls_source: ls.dokument_nummer || ls.id.slice(0, 8) }));
                      });
                      const rePos: any[] = (selectedRE.positionen as any[]) || [];
                      const score = aiMatchResult.match_score ?? 0;
                      const scoreColor =
                        score >= 100 ? "bg-green-100 text-green-800 border-green-300"
                        : score >= 80 ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : score >= 50 ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                        : "bg-red-100 text-red-800 border-red-300";
                      return (
                        <>
                          {/* Zusammenfassung + Score */}
                          <div className="p-4 rounded-lg border bg-card space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                <h3 className="font-semibold">KI-Analyse</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={scoreColor + " border text-sm px-3 py-1"}>
                                  Übereinstimmung: {score}%
                                </Badge>
                                <Button variant="outline" size="sm" onClick={runAIMatch} disabled={aiMatchLoading}>
                                  {aiMatchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Neu analysieren"}
                                </Button>
                              </div>
                            </div>
                            {aiMatchResult.zusammenfassung && (
                              <p className="text-sm text-muted-foreground">{aiMatchResult.zusammenfassung}</p>
                            )}
                          </div>

                          {/* Matches */}
                          {aiMatchResult.matches && aiMatchResult.matches.length > 0 && (
                            <div className="border rounded-lg overflow-hidden">
                              <div className="px-4 py-2 bg-muted/50 border-b">
                                <h4 className="text-sm font-medium">Zuordnung der Positionen</h4>
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs w-8"></TableHead>
                                    <TableHead className="text-xs">Lieferschein</TableHead>
                                    <TableHead className="text-xs">Rechnung</TableHead>
                                    <TableHead className="text-xs">Bemerkung</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {aiMatchResult.matches.map((m, idx) => {
                                    const ls = lsPos[m.lieferschein_index];
                                    const re = rePos[m.rechnung_index];
                                    const icon =
                                      m.status === "match" ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                      : m.status === "menge_abweichung" ? <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                      : <XCircle className="w-4 h-4 text-red-500" />;
                                    return (
                                      <TableRow key={idx}>
                                        <TableCell className="text-xs">{icon}</TableCell>
                                        <TableCell className="text-xs">
                                          {ls ? (
                                            <div>
                                              <div className="font-medium">{ls.material || "–"}</div>
                                              <div className="text-muted-foreground">{ls.menge || "–"} {ls.einheit || ""}</div>
                                            </div>
                                          ) : <span className="text-muted-foreground">–</span>}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {re ? (
                                            <div>
                                              <div className="font-medium">{re.material || "–"}</div>
                                              <div className="text-muted-foreground">{re.menge || "–"} {re.einheit || ""}</div>
                                            </div>
                                          ) : <span className="text-muted-foreground">–</span>}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{m.bemerkung}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          {/* Nur im Lieferschein */}
                          {aiMatchResult.nur_im_lieferschein && aiMatchResult.nur_im_lieferschein.length > 0 && (
                            <div className="border border-red-200 rounded-lg overflow-hidden bg-red-50/40">
                              <div className="px-4 py-2 bg-red-100/60 border-b border-red-200">
                                <h4 className="text-sm font-medium text-red-900">Nur im Lieferschein — fehlt in Rechnung</h4>
                              </div>
                              <div className="divide-y divide-red-100">
                                {aiMatchResult.nur_im_lieferschein.map((p, idx) => {
                                  const ls = lsPos[p.lieferschein_index];
                                  return (
                                    <div key={idx} className="px-4 py-2 text-sm">
                                      <div className="font-medium">{p.material || ls?.material || "–"}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {ls ? `${ls.menge || "–"} ${ls.einheit || ""} — ` : ""}{p.hinweis}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Nur in Rechnung */}
                          {aiMatchResult.nur_in_rechnung && aiMatchResult.nur_in_rechnung.length > 0 && (
                            <div className="border border-yellow-200 rounded-lg overflow-hidden bg-yellow-50/40">
                              <div className="px-4 py-2 bg-yellow-100/60 border-b border-yellow-200">
                                <h4 className="text-sm font-medium text-yellow-900">Nur in Rechnung — zusätzlich</h4>
                              </div>
                              <div className="divide-y divide-yellow-100">
                                {aiMatchResult.nur_in_rechnung.map((p, idx) => {
                                  const re = rePos[p.rechnung_index];
                                  return (
                                    <div key={idx} className="px-4 py-2 text-sm">
                                      <div className="font-medium">{p.material || re?.material || "–"}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {re ? `${re.menge || "–"} ${re.einheit || ""} — ` : ""}{p.hinweis}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Lieferscheine */}
          <TabsContent value="lieferscheine">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <Filter className="w-5 h-5 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Lieferant suchen..."
                    value={filterLieferantLS}
                    onChange={(e) => setFilterLieferantLS(e.target.value)}
                    className="w-[160px] h-10"
                  />
                  <Select value={filterTypLS} onValueChange={setFilterTypLS}>
                    <SelectTrigger className="w-[160px] h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle Typen</SelectItem>
                      <SelectItem value="lieferschein">Lieferschein</SelectItem>
                      <SelectItem value="lagerlieferschein">Lagerlieferschein</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Lieferant</TableHead>
                      <TableHead className="hidden md:table-cell">Projekt</TableHead>
                      <TableHead className="hidden md:table-cell">Hochgeladen von</TableHead>
                      <TableHead className="hidden sm:table-cell">Belegnr.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLieferscheine.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Keine Lieferscheine im gewählten Zeitraum
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLieferscheine.map((doc) => (
                        <TableRow
                          key={doc.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelectedDoc(doc); setShowDetailDialog(true); }}
                        >
                          <TableCell className="text-sm">
                            {doc.datum ? format(parseISO(doc.datum), "dd.MM.yyyy") : "–"}
                          </TableCell>
                          <TableCell>
                            <Badge className={doc.typ === "lagerlieferschein" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800"}>
                              {doc.typ === "lagerlieferschein" ? "Lagerliefersch." : "Lieferschein"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{doc.lieferant || "–"}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{(doc as any).project_name || "–"}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{(doc as any).employee_name || "–"}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{doc.belegnummer || "–"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Dialog */}
      <DocumentDetailDialog
        document={selectedDoc}
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        isAdmin={true}
        onUpdate={() => { fetchData(); setShowDetailDialog(false); }}
        onDelete={() => fetchData()}
      />

      {/* Batch-Verarbeitung */}
      <BatchInvoiceProcessor open={showBatchDialog} onOpenChange={setShowBatchDialog} />
    </div>
  );
}
