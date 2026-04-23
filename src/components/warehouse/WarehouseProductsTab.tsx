import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, Pencil, Trash2, Search, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_LABELS, type WarehouseProduct, type WarehouseProductCategory } from "@/types/warehouse";
import { WarehouseProductFormDialog } from "./WarehouseProductFormDialog";
import { WarehouseExcelImportDialog } from "./WarehouseExcelImportDialog";

export function WarehouseProductsTab() {
  const { toast } = useToast();
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<WarehouseProduct | null>(null);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("warehouse_products")
      .select("*")
      .order("category")
      .order("name");
    if (data) setProducts(data as unknown as WarehouseProduct[]);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Produkt "${name}" wirklich unwiderruflich löschen?`)) return;
    const { error } = await supabase.from("warehouse_products").delete().eq("id", id);
    if (error) {
      toast({
        variant: "destructive",
        title: "Löschen nicht möglich",
        description: "Das Produkt hat noch Lagerbewegungen oder Lieferscheine und kann daher nicht gelöscht werden.",
      });
      return;
    }
    toast({ title: "Produkt gelöscht" });
    fetchProducts();
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      CATEGORY_LABELS[p.category]?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Produkte suchen..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {products.length > 0 && (
            <Button variant="outline" onClick={() => {
              const data = filtered.map((p) => ({
                Name: p.name,
                Kategorie: CATEGORY_LABELS[p.category] || p.category,
                Einheit: p.einheit,
                "EK-Preis": p.ek_preis != null ? p.ek_preis : "",
                Bestand: p.current_stock,
              }));
              const ws = XLSX.utils.json_to_sheet(data);
              const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
              const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
              for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r: 0, c });
                if (ws[addr]) ws[addr].s = headerStyle;
              }
              ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Lagerbestand");
              XLSX.writeFile(wb, `Lagerbestand_${new Date().toISOString().slice(0, 10)}.xlsx`);
            }}>
              <Download className="w-4 h-4 mr-2" /> Excel
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Excel Import
          </Button>
          <Button onClick={() => { setEditProduct(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Produkt
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Einheit</TableHead>
                  <TableHead className="text-right">EK-Preis</TableHead>
                  <TableHead className="text-right">Bestand</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {products.length === 0 ? "Keine Produkte vorhanden" : "Keine Ergebnisse"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_LABELS[p.category] || p.category}</Badge>
                      </TableCell>
                      <TableCell>{p.einheit}</TableCell>
                      <TableCell className="text-right">
                        {p.ek_preis != null ? `€ ${p.ek_preis.toFixed(2)}` : "–"}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${p.current_stock < 0 ? "text-red-600" : ""}`}>
                        {p.current_stock}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => { setEditProduct(p); setFormOpen(true); }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => handleDelete(p.id, p.name)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <WarehouseProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
        onSaved={fetchProducts}
      />

      <WarehouseExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchProducts}
      />
    </div>
  );
}
