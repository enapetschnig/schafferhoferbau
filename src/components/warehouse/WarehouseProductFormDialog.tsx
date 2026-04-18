import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { WarehouseProduct } from "@/types/warehouse";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: WarehouseProduct | null;
  onSaved: () => void;
}

type Category = { id: string; slug: string; label: string };

export function WarehouseProductFormDialog({ open, onOpenChange, product, onSaved }: Props) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [einheit, setEinheit] = useState("Stück");
  const [ekPreis, setEkPreis] = useState("");
  const [aufschlag, setAufschlag] = useState("");
  const [rechnungsdatum, setRechnungsdatum] = useState("");
  const [lieferdatum, setLieferdatum] = useState("");
  const [lieferant, setLieferant] = useState("");
  const [currentStock, setCurrentStock] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("warehouse_categories").select("id, slug, label").order("sort_order").order("label");
      setCategories(data || []);
    })();
  }, [open]);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategory(product.category);
      setEinheit(product.einheit || "Stück");
      setEkPreis(product.ek_preis?.toString() || "");
      setAufschlag((product as any).aufschlag_prozent?.toString() || "");
      setRechnungsdatum((product as any).rechnungsdatum || "");
      setLieferdatum((product as any).lieferdatum || "");
      setLieferant((product as any).lieferant || "");
      setCurrentStock(product.current_stock?.toString() || "");
    } else {
      setName("");
      setCategory(categories[0]?.slug || "kleinteile");
      setEinheit("Stück");
      setEkPreis("");
      setAufschlag("");
      setRechnungsdatum("");
      setLieferdatum("");
      setLieferant("");
      setCurrentStock("");
    }
  }, [product, open, categories]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name ist erforderlich" });
      return;
    }
    if (!lieferant.trim()) {
      toast({ variant: "destructive", title: "Lieferant ist Pflichtfeld" });
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        category,
        einheit: einheit.trim() || "Stück",
        ek_preis: ekPreis ? parseFloat(ekPreis.replace(",", ".")) : null,
        aufschlag_prozent: aufschlag ? parseFloat(aufschlag.replace(",", ".")) : 0,
        rechnungsdatum: rechnungsdatum || null,
        lieferdatum: lieferdatum || null,
        lieferant: lieferant.trim(),
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Produktname" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kategorie *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.slug} value={cat.slug}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Einheit</Label>
              <Input value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="Stück" />
            </div>
          </div>
          <div>
            <Label>Lieferant *</Label>
            <Input
              value={lieferant}
              onChange={(e) => setLieferant(e.target.value)}
              placeholder="z.B. Baumit, Lagerhaus"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>EK-Preis (€)</Label>
              <Input value={ekPreis} onChange={(e) => setEkPreis(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div>
              <Label>Aufschlag (%)</Label>
              <Input value={aufschlag} onChange={(e) => setAufschlag(e.target.value)} placeholder="0" inputMode="decimal" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rechnungsdatum</Label>
              <Input type="date" value={rechnungsdatum} onChange={(e) => setRechnungsdatum(e.target.value)} />
            </div>
            <div>
              <Label>Lieferdatum</Label>
              <Input type="date" value={lieferdatum} onChange={(e) => setLieferdatum(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Aktueller Bestand</Label>
            <Input value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} placeholder="0" inputMode="decimal" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
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
