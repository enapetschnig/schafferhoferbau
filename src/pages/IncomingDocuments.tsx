import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DocumentCaptureDialog } from "@/components/DocumentCaptureDialog";
import { DocumentDetailDialog, type IncomingDocument } from "@/components/DocumentDetailDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Plus, Filter, FileText, ArrowRightLeft, Camera, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import * as XLSX from "xlsx-js-style";

const monthNames = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const TYP_LABELS: Record<string, { label: string; color: string }> = {
  lieferschein: { label: "Lieferschein", color: "bg-blue-100 text-blue-800" },
  lagerlieferschein: { label: "Lagerliefersch.", color: "bg-yellow-100 text-yellow-800" },
  rechnung: { label: "Rechnung", color: "bg-purple-100 text-purple-800" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  offen: { label: "Offen", color: "bg-red-100 text-red-800" },
  bezahlt: { label: "Bezahlt", color: "bg-green-100 text-green-800" },
  storniert: { label: "Storniert", color: "bg-gray-100 text-gray-800" },
};

export default function IncomingDocuments() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const now = new Date();

  const [documents, setDocuments] = useState<IncomingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [filterTyp, setFilterTyp] = useState("alle");
  const [filterStatus, setFilterStatus] = useState("alle");
  const [filterProject, setFilterProject] = useState(searchParams.get("project") || "alle");
  const [filterLieferant, setFilterLieferant] = useState("");
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());

  const [showCaptureDialog, setShowCaptureDialog] = useState(() => searchParams.get("capture") === "1");
  const hideListInitially = searchParams.get("capture") === "1";
  const [showList, setShowList] = useState(!hideListInitially);
  const [captureDocType, setCaptureDocType] = useState<"lieferschein" | "rechnung">("lieferschein");
  const [captureSkipPhoto, setCaptureSkipPhoto] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [zipLoading, setZipLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<IncomingDocument | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [filterMonth, filterYear]);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setIsAdmin(roleData?.role === "administrator");
    }
  };

  const fetchDocuments = useCallback(async () => {
    setLoading(true);

    const startDate = new Date(filterYear, filterMonth - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(filterYear, filterMonth, 0).toISOString().split("T")[0];

    let query = supabase
      .from("incoming_documents")
      .select("*, projects(name)")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Dokumente konnten nicht geladen werden" });
      setLoading(false);
      return;
    }

    if (data) {
      // Fetch employee names
      const userIds = [...new Set(data.map((d: any) => d.user_id))];
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .in("user_id", userIds);

      const nameMap: Record<string, string> = {};
      empData?.forEach((e: any) => {
        if (e.user_id) nameMap[e.user_id] = `${e.vorname} ${e.nachname}`.trim();
      });

      setDocuments(
        data.map((d: any) => ({
          ...d,
          project_name: d.projects?.name || "–",
          employee_name: nameMap[d.user_id] || "–",
        }))
      );
    }

    setLoading(false);
  }, [filterMonth, filterYear]);

  // Apply client-side filters
  const filtered = documents.filter((doc) => {
    if (filterTyp !== "alle" && doc.typ !== filterTyp) return false;
    if (filterStatus !== "alle" && doc.status !== filterStatus) return false;
    if (filterProject !== "alle" && doc.project_id !== filterProject) return false;
    if (filterLieferant && doc.lieferant && !doc.lieferant.toLowerCase().includes(filterLieferant.toLowerCase())) return false;
    if (filterLieferant && !doc.lieferant) return false;
    return true;
  });

  // Abgleich: filter without typ/status (show all for reconciliation)
  const abgleichFiltered = documents.filter((doc) => {
    if (filterProject !== "alle" && doc.project_id !== filterProject) return false;
    if (filterLieferant && doc.lieferant && !doc.lieferant.toLowerCase().includes(filterLieferant.toLowerCase())) return false;
    if (filterLieferant && !doc.lieferant) return false;
    return true;
  });

  const lieferantenAbgleich = useMemo(() => {
    const lieferanten = [...new Set(abgleichFiltered.filter(d => d.lieferant).map(d => d.lieferant!))];
    return lieferanten.map(l => {
      const docs = abgleichFiltered.filter(d => d.lieferant === l);
      const rechnungen = docs.filter(d => d.typ === "rechnung");
      const lieferscheine = docs.filter(d => d.typ === "lieferschein" || d.typ === "lagerlieferschein");
      const totalRechnungen = rechnungen.reduce((s, d) => s + (d.betrag ? Number(d.betrag) : 0), 0);
      const totalLieferscheine = lieferscheine.reduce((s, d) => s + (d.betrag ? Number(d.betrag) : 0), 0);
      return {
        lieferant: l,
        rechnungen,
        lieferscheine,
        totalRechnungen,
        totalLieferscheine,
        differenz: totalRechnungen - totalLieferscheine,
      };
    }).sort((a, b) => Math.abs(b.differenz) - Math.abs(a.differenz));
  }, [abgleichFiltered]);

  // Stats
  const offeneLieferscheine = documents.filter(d => d.status === "offen" && (d.typ === "lieferschein" || d.typ === "lagerlieferschein")).length;
  const offeneRechnungen = documents.filter(d => d.status === "offen" && d.typ === "rechnung").length;

  const exportToExcel = () => {
    const rows: (string | number)[][] = [
      ["Lieferscheine & Rechnungen", "", "", "", "", "", ""],
      [`${monthNames[filterMonth - 1]} ${filterYear}`, "", "", "", "", "", ""],
      [],
      ["Datum", "Typ", "Lieferant", "Belegnr.", "Projekt", "Betrag", "Status", "Mitarbeiter"],
    ];

    for (const doc of filtered) {
      rows.push([
        doc.dokument_datum ? format(parseISO(doc.dokument_datum), "dd.MM.yyyy") : "–",
        TYP_LABELS[doc.typ]?.label || doc.typ,
        doc.lieferant || "–",
        doc.dokument_nummer || "–",
        doc.project_name || "–",
        doc.typ !== "rechnung" && doc.betrag != null ? Number(doc.betrag) : 0,
        STATUS_LABELS[doc.status]?.label || doc.status,
        doc.employee_name || "–",
      ]);
    }

    rows.push([]);
    rows.push(["", "", "", "", "GESAMT", filtered.reduce((s, d) => s + (d.typ !== "rechnung" && d.betrag ? Number(d.betrag) : 0), 0), "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dokumente");
    XLSX.writeFile(wb, `Lieferscheine_Rechnungen_${monthNames[filterMonth - 1]}_${filterYear}.xlsx`);
    toast({ title: "Exportiert", description: "Excel-Datei wurde heruntergeladen" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader title="Lieferscheine & Rechnungen" backPath="/" />

        {/* Schnell-Buttons fuer Erfassung */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Button
            size="lg"
            className="h-auto py-3"
            onClick={() => {
              setCaptureDocType("lieferschein");
              setCaptureSkipPhoto(false);
              setShowCaptureDialog(true);
            }}
          >
            <Camera className="w-5 h-5 mr-2" />
            <div className="text-left">
              <div className="font-semibold">Lieferschein</div>
              <div className="text-xs opacity-90">abfotografieren</div>
            </div>
          </Button>
          {isAdmin && (
            <Button
              size="lg"
              variant="secondary"
              className="h-auto py-3"
              onClick={() => {
                setCaptureDocType("rechnung");
                setCaptureSkipPhoto(false);
                setShowCaptureDialog(true);
              }}
            >
              <Camera className="w-5 h-5 mr-2" />
              <div className="text-left">
                <div className="font-semibold">Rechnung</div>
                <div className="text-xs opacity-90">abfotografieren</div>
              </div>
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className="h-auto py-3"
            onClick={() => {
              setCaptureDocType("lieferschein");
              setCaptureSkipPhoto(true);
              setShowCaptureDialog(true);
            }}
          >
            <Pencil className="w-5 h-5 mr-2" />
            <div className="text-left">
              <div className="font-semibold">Lieferschein</div>
              <div className="text-xs opacity-90">händisch erstellen</div>
            </div>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Lieferscheine</CardDescription>
              <CardTitle className="text-2xl">{offeneLieferscheine}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Rechnungen</CardDescription>
              <CardTitle className="text-2xl">{offeneRechnungen}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="dokumente">
          <TabsList className="mb-4">
            <TabsTrigger value="dokumente">
              <FileText className="w-4 h-4 mr-1.5" />
              Lieferscheine hochladen
            </TabsTrigger>
            <TabsTrigger value="abgleich">
              <ArrowRightLeft className="w-4 h-4 mr-1.5" />
              Abgleich
            </TabsTrigger>
          </TabsList>

          {/* Dokumente Tab */}
          <TabsContent value="dokumente">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Filter className="w-5 h-5 text-muted-foreground shrink-0" />

                    <Select value={filterTyp} onValueChange={setFilterTyp}>
                      <SelectTrigger className="w-[160px] h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle Typen</SelectItem>
                        <SelectItem value="lieferschein">Lieferschein</SelectItem>
                        <SelectItem value="lagerlieferschein">Lagerlieferschein</SelectItem>
                        <SelectItem value="rechnung">Rechnung</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-[130px] h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle Status</SelectItem>
                        <SelectItem value="offen">Offen</SelectItem>
                        <SelectItem value="bezahlt">Bezahlt</SelectItem>
                        <SelectItem value="storniert">Storniert</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={filterProject} onValueChange={setFilterProject}>
                      <SelectTrigger className="w-[180px] h-10">
                        <SelectValue placeholder="Alle Projekte" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle Projekte</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
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
                        {years.map(y => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={exportToExcel} disabled={filtered.length === 0}>
                      <Download className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Excel</span>
                    </Button>
                    <Button onClick={() => setShowCaptureDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Erfassen</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <p className="text-center py-8 text-muted-foreground">Lädt...</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Keine Dokumente im ausgewählten Zeitraum</p>
                  </div>
                ) : (
                  <>
                    {selectedDocIds.size > 0 && (
                      <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg flex-wrap">
                        <Badge variant="secondary">{selectedDocIds.size} ausgewählt</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={zipLoading}
                          onClick={async () => {
                            setZipLoading(true);
                            try {
                              const { default: JSZip } = await import("jszip");
                              const zip = new JSZip();
                              const docs = filtered.filter(d => selectedDocIds.has(d.id));
                              for (const doc of docs) {
                                const urls: string[] = [doc.photo_url];
                                if ((doc as any).zusatz_seiten_urls) urls.push(...(doc as any).zusatz_seiten_urls);
                                for (let i = 0; i < urls.length; i++) {
                                  try {
                                    const resp = await fetch(urls[i]);
                                    const blob = await resp.blob();
                                    const ext = (urls[i].split(".").pop() || "jpg").split("?")[0];
                                    const label = (doc.typ === "rechnung" ? "Rechnung" : "Lieferschein");
                                    const fname = `${label}_${(doc.lieferant || "ohne-lieferant").replace(/[^a-z0-9]/gi, "_")}_${doc.id.slice(0, 6)}${urls.length > 1 ? `_seite${i + 1}` : ""}.${ext}`;
                                    zip.file(fname, blob);
                                  } catch { /* skip */ }
                                }
                              }
                              const zipBlob = await zip.generateAsync({ type: "blob" });
                              const url = URL.createObjectURL(zipBlob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `Dokumente_${new Date().toISOString().slice(0, 10)}.zip`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast({ title: `${docs.length} Dokument(e) als ZIP heruntergeladen` });
                            } catch (err: any) {
                              toast({ variant: "destructive", title: "Fehler", description: err.message });
                            } finally {
                              setZipLoading(false);
                            }
                          }}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          {zipLoading ? "Erstellt ZIP..." : "Als ZIP herunterladen"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedDocIds(new Set())}>
                          Auswahl löschen
                        </Button>
                      </div>
                    )}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={filtered.length > 0 && selectedDocIds.size === filtered.length}
                              onCheckedChange={(v) => {
                                if (v) setSelectedDocIds(new Set(filtered.map(d => d.id)));
                                else setSelectedDocIds(new Set());
                              }}
                            />
                          </TableHead>
                          <TableHead>Datum</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Lieferant</TableHead>
                          <TableHead className="hidden md:table-cell">Projekt</TableHead>
                          <TableHead className="hidden sm:table-cell">Belegnr.</TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((doc) => {
                          const typInfo = TYP_LABELS[doc.typ] || TYP_LABELS.lieferschein;
                          const statusInfo = STATUS_LABELS[doc.status] || STATUS_LABELS.offen;

                          return (
                            <TableRow
                              key={doc.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => { setSelectedDoc(doc); setShowDetailDialog(true); }}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedDocIds.has(doc.id)}
                                  onCheckedChange={() => {
                                    setSelectedDocIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(doc.id)) next.delete(doc.id);
                                      else next.add(doc.id);
                                      return next;
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {doc.dokument_datum
                                  ? format(parseISO(doc.dokument_datum), "dd.MM.yyyy")
                                  : format(new Date(doc.created_at), "dd.MM.yyyy")}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  <Badge className={typInfo.color + " text-xs"}>{typInfo.label}</Badge>
                                  {(doc as any).ist_retour && (
                                    <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">Retour</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{doc.lieferant || "–"}</TableCell>
                              <TableCell className="hidden md:table-cell">{doc.project_name}</TableCell>
                              <TableCell className="hidden sm:table-cell font-mono text-xs">{doc.dokument_nummer || "–"}</TableCell>
                              <TableCell className="text-right font-medium">
                                {doc.betrag != null ? `€ ${Number(doc.betrag).toFixed(2)}` : "–"}
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
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Abgleich Tab */}
          <TabsContent value="abgleich">
            {/* Month/Year + Lieferant filters for Abgleich */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Filter className="w-5 h-5 text-muted-foreground shrink-0" />
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="w-[180px] h-10">
                  <SelectValue placeholder="Alle Projekte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Projekte</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
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
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Lädt...</p>
            ) : lieferantenAbgleich.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ArrowRightLeft className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Keine Dokumente für {monthNames[filterMonth - 1]} {filterYear}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lieferantenAbgleich.map((entry) => {
                  const diff = entry.differenz;
                  const diffColor = diff === 0
                    ? "text-green-700"
                    : diff > 0
                    ? "text-orange-600"
                    : "text-red-600";
                  const diffBg = diff === 0
                    ? "bg-green-50 border-green-200"
                    : diff > 0
                    ? "bg-orange-50 border-orange-200"
                    : "bg-red-50 border-red-200";

                  return (
                    <Card key={entry.lieferant} className={`border ${diffBg}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <CardTitle className="text-base">{entry.lieferant}</CardTitle>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">
                              {entry.rechnungen.length} Rechnung{entry.rechnungen.length !== 1 ? "en" : ""}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {entry.lieferscheine.length} Lieferschein{entry.lieferscheine.length !== 1 ? "e" : ""}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs mb-0.5">Rechnungen</p>
                            <p className="font-semibold">€ {entry.totalRechnungen.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-0.5">Lieferscheine</p>
                            <p className="font-semibold">€ {entry.totalLieferscheine.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-0.5">Differenz</p>
                            <p className={`font-bold ${diffColor}`}>
                              {diff > 0 ? "+" : ""}€ {diff.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {/* Document list */}
                        {entry.rechnungen.length > 0 || entry.lieferscheine.length > 0 ? (
                          <div className="mt-3 pt-3 border-t space-y-1">
                            {[...entry.rechnungen, ...entry.lieferscheine]
                              .sort((a, b) => (a.dokument_datum || a.created_at) > (b.dokument_datum || b.created_at) ? -1 : 1)
                              .map(doc => {
                                const typInfo = TYP_LABELS[doc.typ] || TYP_LABELS.lieferschein;
                                return (
                                  <div
                                    key={doc.id}
                                    className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-white/60 rounded px-1"
                                    onClick={() => { setSelectedDoc(doc); setShowDetailDialog(true); }}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Badge className={typInfo.color + " text-[10px] px-1 py-0 shrink-0"}>{typInfo.label}</Badge>
                                      <span className="text-muted-foreground font-mono">
                                        {doc.dokument_datum
                                          ? format(parseISO(doc.dokument_datum), "dd.MM.")
                                          : format(new Date(doc.created_at), "dd.MM.")}
                                      </span>
                                      {doc.dokument_nummer && (
                                        <span className="text-muted-foreground truncate">{doc.dokument_nummer}</span>
                                      )}
                                    </div>
                                    <span className="font-medium shrink-0 ml-2">
                                      {doc.betrag != null ? `€ ${Number(doc.betrag).toFixed(2)}` : "–"}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Summary */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-3 gap-4 text-sm font-semibold">
                      <div>
                        <p className="text-muted-foreground text-xs mb-0.5 font-normal">Rechnungen gesamt</p>
                        <p>€ {lieferantenAbgleich.reduce((s, e) => s + e.totalRechnungen, 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-0.5 font-normal">Lieferscheine gesamt</p>
                        <p>€ {lieferantenAbgleich.reduce((s, e) => s + e.totalLieferscheine, 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-0.5 font-normal">Gesamtdifferenz</p>
                        <p className={lieferantenAbgleich.reduce((s, e) => s + e.differenz, 0) === 0 ? "text-green-700" : "text-orange-600"}>
                          € {lieferantenAbgleich.reduce((s, e) => s + e.differenz, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Capture Dialog */}
      <DocumentCaptureDialog
        open={showCaptureDialog}
        onOpenChange={setShowCaptureDialog}
        onSuccess={fetchDocuments}
        defaultProjectId={searchParams.get("project") || undefined}
        defaultDocType={captureDocType}
        skipPhoto={captureSkipPhoto}
        onShowAll={hideListInitially ? () => { setShowCaptureDialog(false); setShowList(true); } : undefined}
      />

      {/* Detail Dialog */}
      <DocumentDetailDialog
        document={selectedDoc}
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        isAdmin={isAdmin}
        onUpdate={() => { fetchDocuments(); setShowDetailDialog(false); }}
      />
    </div>
  );
}
