import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_LABELS, CATEGORY_OPTIONS, type WarehouseProduct, type WarehouseProductCategory } from "@/types/warehouse";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: WarehouseProduct | null;
  onSaved: () => void;
}

export function WarehouseProductFormDialog({ open, onOpenChange, product, onSaved }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WarehouseProductCategory>("kleinteile");
  const [einheit, setEinheit] = useState("Stück");
  const [ekPreis, setEkPreis] = useState("");
  const [currentStock, setCurrentStock] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategory(product.category);
      setEinheit(product.einheit);
      setEkPreis(product.ek_preis?.toString() || "");
      setCurrentStock(product.current_stock?.toString() || "");
    } else {
      setName("");
      setCategory("kleinteile");
      setEinheit("Stück");
      setEkPreis("");
      setCurrentStock("");
    }
  }, [product, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name ist erforderlich" });
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        category,
        einheit: einheit.trim() || "Stück",
        ek_preis: ekPreis ? parseFloat(ekPreis.replace(",", ".")) : null,
        current_stock: currentStock ? parseFloat(currentStock.replace(",", ".")) : 0,
        updated_at: new Date().toISOString(),
      };

      if (product) {
        await supabase.from("warehouse_products").update(data).eq("id", product.id);
        toast({ title: "Produkt aktualisiert" });
      } else {
        await supabase.from("warehouse_products").insert(data);
        toast({ title: "Produkt erstellt" });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Fehler", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Produktname" />
          </div>
          <div>
            <Label>Kategorie *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as WarehouseProductCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Einheit</Label>
            <Input value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="Stück" />
          </div>
          <div>
            <Label>EK-Preis (€)</Label>
            <Input
              value={ekPreis}
              onChange={(e) => setEkPreis(e.target.value)}
              placeholder="0,00"
              type="text"
              inputMode="decimal"
            />
          </div>
          <div>
            <Label>Aktueller Bestand</Label>
            <Input
              value={currentStock}
              onChange={(e) => setCurrentStock(e.target.value)}
              placeholder="0"
              type="text"
              inputMode="decimal"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
