import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  TRANSFER_TYPE_LABELS,
  type WarehouseDeliveryNote,
  type WarehouseTransferType,
} from "@/types/warehouse";
import { WarehouseDeliveryNoteDialog } from "./WarehouseDeliveryNoteDialog";
import { WarehouseDeliveryNoteDetail } from "./WarehouseDeliveryNoteDetail";

interface Props {
  isAdmin: boolean;
}

const MONTHS = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function WarehouseDeliveryNotesTab({ isAdmin }: Props) {
  const [notes, setNotes] = useState<WarehouseDeliveryNote[]>([]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState<WarehouseTransferType | "all">("all");
  const [filterProject, setFilterProject] = useState("all");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<WarehouseDeliveryNote | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [month, year]);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchNotes = async () => {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endMonth = month === 11 ? 0 : month + 1;
    const endYear = month === 11 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;

    // Load project names locally to avoid race condition with projects state
    const { data: projData } = await supabase.from("projects").select("id, name");
    const projectMap = Object.fromEntries((projData || []).map((p) => [p.id, p.name]));

    let query = supabase
      .from("warehouse_delivery_notes")
      .select("*")
      .gte("datum", startDate)
      .lt("datum", endDate)
      .is("parent_note_id", null) // Only show top-level notes
      .order("datum", { ascending: false });

    if (!isAdmin) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) query = query.eq("user_id", user.id);
    }

    const { data } = await query;
    if (!data) return;

    // Enrich with project names and employee names
    const enriched: WarehouseDeliveryNote[] = [];
    for (const note of data) {
      const enrichedNote = note as unknown as WarehouseDeliveryNote;

      // Get project names from local map (no race condition)
      if (note.source_project_id) {
        enrichedNote.source_project_name = projectMap[note.source_project_id] || "–";
      }
      if (note.target_project_id) {
        enrichedNote.target_project_name = projectMap[note.target_project_id] || "–";
      }

      // Get employee name (vorname + nachname, not "name")
      const { data: emp } = await supabase
        .from("employees")
        .select("vorname, nachname")
        .eq("user_id", note.user_id)
        .maybeSingle();
      enrichedNote.employee_name = emp
        ? `${emp.vorname || ""} ${emp.nachname || ""}`.trim() || "–"
        : "–";

      // Get items
      const { data: items } = await supabase
        .from("warehouse_delivery_note_items")
        .select("*, warehouse_products(name, einheit)")
        .eq("delivery_note_id", note.id);
      if (items) {
        enrichedNote.items = items.map((item: Record<string, unknown>) => ({
          ...item,
          product_name: (item.warehouse_products as Record<string, unknown>)?.name as string,
          product_einheit: (item.warehouse_products as Record<string, unknown>)?.einheit as string,
        })) as WarehouseDeliveryNote["items"];
      }

      enriched.push(enrichedNote);
    }

    setNotes(enriched);
  };

  const filtered = notes.filter((n) => {
    const matchType = filterType === "all" || n.transfer_type === filterType;
    const matchProject =
      filterProject === "all" ||
      n.source_project_id === filterProject ||
      n.target_project_id === filterProject;
    return matchType && matchProject;
  });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium text-sm min-w-[120px] text-center">
            {MONTHS[month]} {year}
          </span>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Neuer Lieferschein
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={filterType} onValueChange={(v) => setFilterType(v as WarehouseTransferType | "all")}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Alle Typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {(Object.keys(TRANSFER_TYPE_LABELS) as WarehouseTransferType[]).map((type) => (
              <SelectItem key={type} value={type}>{TRANSFER_TYPE_LABELS[type].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Alle Projekte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Projekte</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Von / Nach</TableHead>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead className="text-right">Pos.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Keine Lieferscheine in diesem Zeitraum
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((note) => {
                    const typeInfo = TRANSFER_TYPE_LABELS[note.transfer_type];
                    const projectLabel =
                      note.transfer_type === "lager_to_baustelle"
                        ? `Lager → ${note.target_project_name}`
                        : note.transfer_type === "baustelle_to_lager"
                        ? `${note.source_project_name} → Lager`
                        : `${note.source_project_name} → ${note.target_project_name}`;

                    return (
                      <TableRow
                        key={note.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setSelectedNote(note); setDetailOpen(true); }}
                      >
                        <TableCell className="font-medium">
                          {format(new Date(note.datum), "dd.MM.yyyy", { locale: de })}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${typeInfo.color} text-xs`}>{typeInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{projectLabel}</TableCell>
                        <TableCell className="text-sm">{note.employee_name}</TableCell>
                        <TableCell className="text-right">{note.items?.length || 0}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <WarehouseDeliveryNoteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => { fetchNotes(); }}
      />

      <WarehouseDeliveryNoteDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        note={selectedNote}
      />
    </div>
  );
}
