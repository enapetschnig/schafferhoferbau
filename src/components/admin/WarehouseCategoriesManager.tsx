import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

type Category = {
  id: string;
  slug: string;
  label: string;
  sort_order: number | null;
};

export function WarehouseCategoriesManager() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ slug: "", label: "", sort_order: "" });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    const { data } = await supabase.from("warehouse_categories").select("*").order("sort_order").order("label");
    setCategories((data as Category[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ slug: "", label: "", sort_order: String((categories.length + 1) * 10) });
    setEditOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ slug: c.slug, label: c.label, sort_order: c.sort_order?.toString() || "0" });
    setEditOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    const slug = (form.slug.trim() || form.label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
    const payload = {
      slug,
      label: form.label.trim(),
      sort_order: form.sort_order ? parseInt(form.sort_order) : 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = editing
      ? await supabase.from("warehouse_categories").update(payload).eq("id", editing.id)
      : await supabase.from("warehouse_categories").insert(payload);
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: editing ? "Kategorie aktualisiert" : "Kategorie angelegt" });
    setEditOpen(false);
    fetch_();
  };

  const remove = async (c: Category) => {
    // Pruefen ob Produkte diese Kategorie noch nutzen
    const { count } = await supabase.from("warehouse_products")
      .select("id", { count: "exact", head: true })
      .eq("category", c.slug);
    if ((count || 0) > 0) {
      if (!confirm(`${count} Produkt(e) nutzen die Kategorie "${c.label}" noch. Trotzdem löschen?`)) return;
    } else {
      if (!confirm(`Kategorie "${c.label}" löschen?`)) return;
    }
    const { error } = await supabase.from("warehouse_categories").delete().eq("id", c.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Kategorie gelöscht" });
    fetch_();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Lager-Kategorien
            </CardTitle>
            <CardDescription>
              Kategorien für den Lagerbestand verwalten. Änderungen wirken sich auf Produkt-Formular und Filter aus.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Neue Kategorie
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Kategorien angelegt.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg border">
                <span className="text-xs text-muted-foreground w-10">#{c.sort_order || 0}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{c.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{c.slug}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(c)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>Bezeichnung *</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="z.B. Werkzeuge" />
            </div>
            <div>
              <Label>Slug (intern, optional - wird automatisch aus Bezeichnung generiert)</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="automatisch" />
            </div>
            <div>
              <Label>Sortier-Reihenfolge</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving || !form.label.trim()}>
              {saving ? "Speichert..." : editing ? "Aktualisieren" : "Anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
