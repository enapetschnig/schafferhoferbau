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
import { Download, Upload, Filter, FileText, Check, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx-js-style";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const prepareFileForAI = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument({ data }).promise;
          const scale = 1.5;
          const maxPages = Math.min(pdf.numPages, 4);
          const pageCanvases: HTMLCanvasElement[] = [];
          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
            pageCanvases.push(canvas);
          }
          const totalW = pageCanvases[0].width;
          const totalH = pageCanvases.reduce((sum, c) => sum + c.height, 0);
          const combined = document.createElement("canvas");
          combined.width = totalW;
          combined.height = totalH;
          const ctx = combined.getContext("2d")!;
          let y = 0;
          for (const pc of pageCanvases) { ctx.drawImage(pc, 0, y); y += pc.height; }
          let w = combined.width, h = combined.height;
          if (w > 1200) { h = Math.round(h * 1200 / w); w = 1200; }
          if (h > 4000) { w = Math.round(w * 4000 / h); h = 4000; }
          const out = document.createElement("canvas");
          out.width = w; out.height = h;
          out.getContext("2d")!.drawImage(combined, 0, 0, w, h);
          const dataUrl = out.toDataURL("image/jpeg", 0.70);
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
  positionen: { material: string; menge: string; einheit: string; preis: string | null }[];
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
  const [editProjectId, setEditProjectId] = useState("");
  const [saving, setSaving] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

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
      setLieferscheine(
        lsData.map((d: any) => ({
          ...d,
          project_name: d.projects?.name || "–",
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
        inv.betrag != null ? Number(inv.betrag) : 0,
        abgleichText,
        STATUS_LABELS[inv.status]?.label || inv.status,
        inv.employee_name || "–",
      ]);
    }

    rows.push([]);
    rows.push(["", "", "", "GESAMT", filtered.reduce((s, d) => s + (d.betrag ? Number(d.betrag) : 0), 0), "", "", ""]);

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

      // Prepare file as base64 for AI (PDF → JPEG via canvas, images resized)
      const { base64, mimeType } = await prepareFileForAI(uploadFile);

      // Call extract-document edge function (SDK handles auth automatically)
      const { data, error: fnError } = await supabase.functions.invoke("extract-document", {
        body: { imageBase64: base64, mediaType: mimeType },
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
      setEditLieferant(data.lieferant || "");
      setEditDatum(data.datum || "");
      setEditBelegnummer(data.belegnummer || "");
      setEditBetrag(data.betrag != null ? String(data.betrag) : "");
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
        positionen: extracted?.positionen || [],
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
      setEditProjectId("");

      // Refresh list
      fetchData();
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Fehler", description: (err as Error).message });
    } finally {
      setSaving(false);
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
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="liste" className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Rechnungen
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Hochladen
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

                  <Button variant="outline" onClick={exportToExcel} disabled={filtered.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Excel</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
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
                            <Label>Betrag (&euro;)</Label>
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

                        {extracted.positionen && extracted.positionen.length > 0 && (
                          <div className="space-y-2">
                            <Label>Positionen</Label>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Menge</TableHead>
                                    <TableHead>Einheit</TableHead>
                                    <TableHead>Preis</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {extracted.positionen.map((pos, i) => (
                                    <TableRow key={i}>
                                      <TableCell>{pos.material}</TableCell>
                                      <TableCell>{pos.menge}</TableCell>
                                      <TableCell>{pos.einheit}</TableCell>
                                      <TableCell>{pos.preis || "–"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}

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
        </Tabs>
      </div>

      {/* Detail Dialog */}
      <DocumentDetailDialog
        document={selectedDoc}
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        isAdmin={true}
        onUpdate={() => { fetchData(); setShowDetailDialog(false); }}
      />
    </div>
  );
}
