import { useState, useEffect } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Package, AlertTriangle, Euro, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  type WarehouseProduct,
  type WarehouseProductCategory,
} from "@/types/warehouse";

interface Props {
  isAdmin: boolean;
}

export function WarehouseStockTab({ isAdmin }: Props) {
  const { toast } = useToast();
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [categories, setCategories] = useState<{ slug: string; label: string }[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<WarehouseProductCategory | "all">("all");
  const [filterLieferant, setFilterLieferant] = useState("");
  const [filterRechnungFrom, setFilterRechnungFrom] = useState("");
  const [filterRechnungTo, setFilterRechnungTo] = useState("");
  const [filterLieferFrom, setFilterLieferFrom] = useState("");
  const [filterLieferTo, setFilterLieferTo] = useState("");
  const [sortField, setSortField] = useState<"name" | "current_stock">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("warehouse_products")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("name");
    if (data) setProducts(data as unknown as WarehouseProduct[]);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from("warehouse_categories").select("slug, label").order("sort_order").order("label");
    if (data) setCategories(data);
  };

  useEffect(() => { fetchProducts(); fetchCategories(); }, []);

  const getCategoryLabel = (slug: string) =>
    categories.find(c => c.slug === slug)?.label || CATEGORY_LABELS[slug] || slug;

  const filtered = products
    .filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        getCategoryLabel(p.category).toLowerCase().includes(search.toLowerCase()) ||
        (p.lieferant || "").toLowerCase().includes(search.toLowerCase());
      const matchCategory = filterCategory === "all" || p.category === filterCategory;
      const matchLieferant = !filterLieferant || (p.lieferant || "").toLowerCase().includes(filterLieferant.toLowerCase());
      const matchRechnung = (!filterRechnungFrom || (p.rechnungsdatum && p.rechnungsdatum >= filterRechnungFrom))
        && (!filterRechnungTo || (p.rechnungsdatum && p.rechnungsdatum <= filterRechnungTo));
      const matchLiefer = (!filterLieferFrom || (p.lieferdatum && p.lieferdatum >= filterLieferFrom))
        && (!filterLieferTo || (p.lieferdatum && p.lieferdatum <= filterLieferTo));
      return matchSearch && matchCategory && matchLieferant && matchRechnung && matchLiefer;
    })
    .sort((a, b) => {
      const valA = sortField === "current_stock" ? a.current_stock : a.name.toLowerCase();
      const valB = sortField === "current_stock" ? b.current_stock : b.name.toLowerCase();
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.current_stock <= 0).length;
  const totalValue = isAdmin
    ? products.reduce((sum, p) => sum + (p.ek_preis || 0) * Math.max(0, p.current_stock), 0)
    : 0;

  // Alle einzigartigen Lieferanten
  const allLieferanten = [...new Set(products.map(p => p.lieferant).filter(Boolean))] as string[];

  // 11-Spalten Excel-Export mit Komma als Dezimaltrennzeichen
  const handleExcelExport = () => {
    const fmt = (n: number | null) => n != null ? n.toFixed(2).replace(".", ",") : "";
    const rows = filtered.map(p => {
      const ekPreis = p.ek_preis || 0;
      const aufschlag = p.aufschlag_prozent || 0;
      const einzelpreisInkl = ekPreis * (1 + aufschlag / 100);
      const gesamtpreis = einzelpreisInkl * Math.max(0, p.current_stock);
      return {
        Kategorie: CATEGORY_LABELS[p.category] || p.category,
        Menge: p.current_stock.toString().replace(".", ","),
        Einheit: p.einheit,
        Artikel: p.name,
        "EK-Preis": fmt(p.ek_preis),
        "Aufschlag (%)": fmt(p.aufschlag_prozent),
        Rechnungsdatum: p.rechnungsdatum ? new Date(p.rechnungsdatum).toLocaleDateString("de-AT") : "",
        Lieferdatum: p.lieferdatum ? new Date(p.lieferdatum).toLocaleDateString("de-AT") : "",
        Lieferant: p.lieferant || "",
        "Einzelpreis inkl. Aufschlag": fmt(einzelpreisInkl),
        Gesamtpreis: fmt(gesamtpreis),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lagerbestand");
    XLSX.writeFile(wb, `Lagerbestand_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Excel-Import: Ueberschreibt alle bestehenden Produkte
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    if (rows.length === 0) { toast({ variant: "destructive", title: "Leere Datei" }); return; }

    // Alle bestehenden Produkte deaktivieren
    await supabase.from("warehouse_products").update({ is_active: false }).eq("is_active", true);

    const catReverse: Record<string, string> = {};
    Object.entries(CATEGORY_LABELS).forEach(([k, v]) => { catReverse[v.toLowerCase()] = k; });

    let imported = 0;
    for (const row of rows) {
      const artikel = (row["Artikel"] || row["artikel"] || row["Name"] || "").toString().trim();
      if (!artikel) continue;

      const katLabel = (row["Kategorie"] || row["kategorie"] || "kleinteile").toString().toLowerCase();
      const parseDe = (v: any) => v != null ? parseFloat(v.toString().replace(",", ".")) || 0 : 0;

      await supabase.from("warehouse_products").insert({
        name: artikel,
        category: catReverse[katLabel] || "kleinteile",
        einheit: (row["Einheit"] || row["einheit"] || "Stk").toString(),
        ek_preis: parseDe(row["EK-Preis"] || row["ek_preis"]) || null,
        aufschlag_prozent: parseDe(row["Aufschlag (%)"] || row["aufschlag_prozent"]) || 0,
        current_stock: parseDe(row["Menge"] || row["menge"] || row["Bestand"]),
        lieferant: (row["Lieferant"] || row["lieferant"] || "").toString() || null,
        rechnungsdatum: row["Rechnungsdatum"] || row["rechnungsdatum"] || null,
        lieferdatum: row["Lieferdatum"] || row["lieferdatum"] || null,
        is_active: true,
      });
      imported++;
    }

    toast({ title: `${imported} Produkte importiert (alle bestehenden ersetzt)` });
    fetchProducts();
    e.target.value = "";
  };

  const toggleSort = (field: "name" | "current_stock") => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className={`grid gap-3 ${isAdmin ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Produkte</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-500" />
              <span className="text-2xl font-bold">{totalProducts}</span>
            </div>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Lagerwert (EK)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Euro className="w-5 h-5 text-green-500" />
                <span className="text-2xl font-bold">EUR {totalValue.toFixed(2).replace(".", ",")}</span>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Niedrigbestand</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${lowStockCount > 0 ? "text-red-500" : "text-green-500"}`} />
              <span className={`text-2xl font-bold ${lowStockCount > 0 ? "text-red-600" : ""}`}>{lowStockCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter + Export/Import */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen (Artikel, Kategorie, Lieferant)..." className="pl-9" />
          </div>
          {allLieferanten.length > 0 && (
            <Select value={filterLieferant || "alle"} onValueChange={(v) => setFilterLieferant(v === "alle" ? "" : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Lieferant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Lieferanten</SelectItem>
                {allLieferanten.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={sortField === "current_stock" ? `stock-${sortDir}` : "name"} onValueChange={(v) => {
            if (v === "name") { setSortField("name"); setSortDir("asc"); }
            else if (v === "stock-asc") { setSortField("current_stock"); setSortDir("asc"); }
            else if (v === "stock-desc") { setSortField("current_stock"); setSortDir("desc"); }
          }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="stock-asc">Bestand ↑</SelectItem>
              <SelectItem value="stock-desc">Bestand ↓</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setShowMoreFilters(!showMoreFilters)}>
            {showMoreFilters ? "Weniger" : "Mehr Filter"}
          </Button>
          {isAdmin && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={handleExcelExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
              <label className="cursor-pointer">
                <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
                <Button size="sm" variant="outline" type="button" onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                  <Upload className="w-4 h-4 mr-1" /> Import
                </Button>
              </label>
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          <Badge variant={filterCategory === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterCategory("all")}>Alle</Badge>
          {categories.map((cat) => (
            <Badge key={cat.slug} variant={filterCategory === cat.slug ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterCategory(cat.slug)}>
              {cat.label}
            </Badge>
          ))}
        </div>
        {showMoreFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Rechnungsdatum von</label>
              <Input type="date" value={filterRechnungFrom} onChange={(e) => setFilterRechnungFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Rechnungsdatum bis</label>
              <Input type="date" value={filterRechnungTo} onChange={(e) => setFilterRechnungTo(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Lieferdatum von</label>
              <Input type="date" value={filterLieferFrom} onChange={(e) => setFilterLieferFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Lieferdatum bis</label>
              <Input type="date" value={filterLieferTo} onChange={(e) => setFilterLieferTo(e.target.value)} className="h-9" />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                    Artikel {sortField === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Einheit</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("current_stock")}>
                    Bestand {sortField === "current_stock" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </TableHead>
                  {isAdmin && <TableHead className="text-right">EK</TableHead>}
                  {isAdmin && <TableHead className="text-right">Aufschlag</TableHead>}
                  {isAdmin && <TableHead className="text-right">VK</TableHead>}
                  <TableHead>Lieferant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 5} className="text-center text-muted-foreground py-8">
                      Keine Produkte gefunden
                    </TableCell>
                  </TableRow>
                ) : filtered.map((p) => {
                  const ekPreis = p.ek_preis || 0;
                  const aufschlag = p.aufschlag_prozent || 0;
                  const vkPreis = ekPreis * (1 + aufschlag / 100);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{CATEGORY_LABELS[p.category]}</Badge></TableCell>
                      <TableCell>{p.einheit}</TableCell>
                      <TableCell className={`text-right font-semibold ${p.current_stock <= 0 ? "text-red-600" : ""}`}>
                        {p.current_stock}
                      </TableCell>
                      {isAdmin && <TableCell className="text-right text-xs">{ekPreis > 0 ? `${ekPreis.toFixed(2).replace(".", ",")}` : "-"}</TableCell>}
                      {isAdmin && <TableCell className="text-right text-xs">{aufschlag > 0 ? `${aufschlag}%` : "-"}</TableCell>}
                      {isAdmin && <TableCell className="text-right text-xs font-medium">{vkPreis > 0 ? `${vkPreis.toFixed(2).replace(".", ",")}` : "-"}</TableCell>}
                      <TableCell className="text-xs">{p.lieferant || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
