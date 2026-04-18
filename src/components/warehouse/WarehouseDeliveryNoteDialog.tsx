import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Plus, Minus, Trash2, ArrowLeft, ArrowRight, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SignaturePad } from "@/components/SignaturePad";
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  TRANSFER_TYPE_LABELS,
  type WarehouseProduct,
  type WarehouseTransferType,
  type WarehouseProductCategory,
} from "@/types/warehouse";

type SelectedItem = {
  product: WarehouseProduct;
  menge: number;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function WarehouseDeliveryNoteDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: Type & Project
  const [transferType, setTransferType] = useState<WarehouseTransferType>("lager_to_baustelle");
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().split("T")[0]);
  const [notizen, setNotizen] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Step 2: Products
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<WarehouseProductCategory | "all">("all");

  // Step 3: Photos
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  // Step 4: Signature
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProjects();
      fetchProducts();
      // Reset
      setStep(1);
      setTransferType("lager_to_baustelle");
      setSourceProjectId("");
      setTargetProjectId("");
      setDatum(new Date().toISOString().split("T")[0]);
      setNotizen("");
      setSelectedItems([]);
      setPhotos([]);
      setPhotoPreviewUrls([]);
      setSignature(null);
      setSignatureName("");
      setProductSearch("");
      setProductCategoryFilter("all");

      // Auto-Fill: Mitarbeitername aus Login + Baustelle aus Plantafel (heutiger Zeitplan)
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: emp } = await supabase
          .from("employees")
          .select("vorname, nachname")
          .eq("user_id", user.id)
          .maybeSingle();
        if (emp) setSignatureName(`${emp.vorname || ""} ${emp.nachname || ""}`.trim());

        // Heutiges Projekt aus worker_assignments
        const today = new Date().toISOString().split("T")[0];
        const { data: assign } = await supabase
          .from("worker_assignments")
          .select("project_id")
          .eq("user_id", user.id)
          .eq("datum", today)
          .limit(1)
          .maybeSingle();
        if (assign?.project_id) {
          // Bei lager_to_baustelle: Ziel-Projekt, sonst Source
          setTargetProjectId(assign.project_id);
        }
      })();
    }
  }, [open]);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("warehouse_products")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (data) setProducts(data as unknown as WarehouseProduct[]);
  };

  const addItem = (product: WarehouseProduct) => {
    if (selectedItems.find((i) => i.product.id === product.id)) return;
    setSelectedItems((prev) => [...prev, { product, menge: 1 }]);
  };

  const updateMenge = (productId: string, menge: number) => {
    if (menge <= 0) return;
    setSelectedItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, menge } : i))
    );
  };

  const removeItem = (productId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    setPhotos((prev) => [...prev, ...newFiles]);
    setPhotoPreviewUrls((prev) => [
      ...prev,
      ...newFiles.map((f) => URL.createObjectURL(f)),
    ]);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const canProceedStep1 = () => {
    if (transferType === "lager_to_baustelle") return !!targetProjectId;
    if (transferType === "baustelle_to_lager") return !!sourceProjectId;
    if (transferType === "baustelle_to_baustelle")
      return !!sourceProjectId && !!targetProjectId && sourceProjectId !== targetProjectId;
    return false;
  };

  const canProceedStep2 = () => selectedItems.length > 0;
  const canProceedStep3 = () => photos.length > 0;
  const canSave = () => !!signature;

  const handleSave = async () => {
    if (!signature) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      // Upload photos
      const photoUrls: string[] = [];
      for (const photo of photos) {
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("warehouse-documents")
          .upload(fileName, photo);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("warehouse-documents")
          .getPublicUrl(fileName);
        photoUrls.push(urlData.publicUrl);
      }

      if (transferType === "baustelle_to_baustelle") {
        // Create parent note
        const { data: parent, error: parentError } = await supabase
          .from("warehouse_delivery_notes")
          .insert({
            transfer_type: "baustelle_to_baustelle",
            source_project_id: sourceProjectId,
            target_project_id: targetProjectId,
            user_id: user.id,
            datum,
            photo_urls: photoUrls,
            unterschrift: signature,
            unterschrift_name: signatureName || null,
            notizen: notizen || null,
          })
          .select("id")
          .single();
        if (parentError) throw parentError;

        // Child 1: Return from source project to warehouse
        const { data: child1, error: c1Error } = await supabase
          .from("warehouse_delivery_notes")
          .insert({
            transfer_type: "baustelle_to_lager",
            source_project_id: sourceProjectId,
            user_id: user.id,
            datum,
            photo_urls: photoUrls,
            unterschrift: signature,
            unterschrift_name: signatureName || null,
            parent_note_id: parent.id,
          })
          .select("id")
          .single();
        if (c1Error) throw c1Error;

        // Child 2: Warehouse to target project
        const { data: child2, error: c2Error } = await supabase
          .from("warehouse_delivery_notes")
          .insert({
            transfer_type: "lager_to_baustelle",
            target_project_id: targetProjectId,
            user_id: user.id,
            datum,
            photo_urls: photoUrls,
            unterschrift: signature,
            unterschrift_name: signatureName || null,
            parent_note_id: parent.id,
          })
          .select("id")
          .single();
        if (c2Error) throw c2Error;

        // Items + stock transactions for both children
        for (const item of selectedItems) {
          // Child 1 items (return)
          await supabase.from("warehouse_delivery_note_items").insert({
            delivery_note_id: child1.id,
            product_id: item.product.id,
            menge: item.menge,
          });
          await supabase.from("warehouse_stock_transactions").insert({
            product_id: item.product.id,
            delivery_note_id: child1.id,
            menge: item.menge, // positive = stock increase
            project_id: sourceProjectId,
          });

          // Child 2 items (new dispatch)
          await supabase.from("warehouse_delivery_note_items").insert({
            delivery_note_id: child2.id,
            product_id: item.product.id,
            menge: item.menge,
          });
          await supabase.from("warehouse_stock_transactions").insert({
            product_id: item.product.id,
            delivery_note_id: child2.id,
            menge: -item.menge, // negative = stock decrease
            project_id: targetProjectId,
          });

          // Net stock effect = 0 (no current_stock update needed)
        }
      } else {
        // Simple transfer: lager_to_baustelle or baustelle_to_lager
        const isReturn = transferType === "baustelle_to_lager";

        const { data: note, error: noteError } = await supabase
          .from("warehouse_delivery_notes")
          .insert({
            transfer_type: transferType,
            source_project_id: isReturn ? sourceProjectId : null,
            target_project_id: !isReturn ? targetProjectId : null,
            user_id: user.id,
            datum,
            photo_urls: photoUrls,
            unterschrift: signature,
            unterschrift_name: signatureName || null,
            notizen: notizen || null,
          })
          .select("id")
          .single();
        if (noteError) throw noteError;

        for (const item of selectedItems) {
          await supabase.from("warehouse_delivery_note_items").insert({
            delivery_note_id: note.id,
            product_id: item.product.id,
            menge: item.menge,
          });

          const stockChange = isReturn ? item.menge : -item.menge;
          await supabase.from("warehouse_stock_transactions").insert({
            product_id: item.product.id,
            delivery_note_id: note.id,
            menge: stockChange,
            project_id: isReturn ? sourceProjectId : targetProjectId,
          });

          // Update denormalized stock
          const { data: prod } = await supabase
            .from("warehouse_products")
            .select("current_stock")
            .eq("id", item.product.id)
            .single();
          if (prod) {
            await supabase
              .from("warehouse_products")
              .update({ current_stock: prod.current_stock + stockChange })
              .eq("id", item.product.id);
          }
        }
      }

      // Verknuepfung zu incoming_documents (allgemeiner Lieferscheine-Bereich)
      // damit der Lieferschein auch dort auftaucht
      try {
        const mainProjectId = transferType === "baustelle_to_lager"
          ? sourceProjectId
          : targetProjectId;
        if (mainProjectId) {
          const transferLabel = transferType === "lager_to_baustelle" ? "Lager → Baustelle"
            : transferType === "baustelle_to_lager" ? "Baustelle → Lager"
            : "Baustelle → Baustelle";
          const positionen = selectedItems.map(i => ({
            material: i.product.name,
            menge: String(i.menge),
            einheit: i.product.einheit || "",
            einzelpreis: null,
            gesamtpreis: null,
          }));
          await supabase.from("incoming_documents").insert({
            project_id: mainProjectId,
            user_id: user.id,
            typ: "lagerlieferschein",
            photo_url: photoUrls[0] || "",
            zusatz_seiten_urls: photoUrls.slice(1),
            lieferant: transferLabel,
            dokument_datum: datum,
            positionen,
            unterschrift: signature,
            unterschrift_name: signatureName || null,
            notizen: notizen || null,
            ist_retour: transferType === "baustelle_to_lager",
          });
        }
      } catch (linkErr) {
        console.warn("Lieferschein konnte nicht in incoming_documents verlinkt werden:", linkErr);
        // nicht fatal - Hauptlieferschein ist bereits gespeichert
      }

      toast({ title: "Lieferschein erstellt" });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Fehler", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
    const matchCategory = productCategoryFilter === "all" || p.category === productCategoryFilter;
    const notSelected = !selectedItems.find((i) => i.product.id === p.id);
    return matchSearch && matchCategory && notSelected;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            Neuer Lieferschein — Schritt {step}/4
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Type & Project */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Transfer-Typ</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {(Object.keys(TRANSFER_TYPE_LABELS) as WarehouseTransferType[]).map((type) => (
                  <Badge
                    key={type}
                    variant={transferType === type ? "default" : "outline"}
                    className="cursor-pointer text-sm py-1 px-3"
                    onClick={() => {
                      setTransferType(type);
                      setSourceProjectId("");
                      setTargetProjectId("");
                    }}
                  >
                    {TRANSFER_TYPE_LABELS[type].label}
                  </Badge>
                ))}
              </div>
            </div>

            {(transferType === "baustelle_to_lager" || transferType === "baustelle_to_baustelle") && (
              <div>
                <Label>Von Baustelle *</Label>
                <Select value={sourceProjectId} onValueChange={setSourceProjectId}>
                  <SelectTrigger><SelectValue placeholder="Projekt wählen..." /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(transferType === "lager_to_baustelle" || transferType === "baustelle_to_baustelle") && (
              <div>
                <Label>{transferType === "baustelle_to_baustelle" ? "Nach Baustelle *" : "Baustelle *"}</Label>
                <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                  <SelectTrigger><SelectValue placeholder="Projekt wählen..." /></SelectTrigger>
                  <SelectContent>
                    {projects
                      .filter((p) => p.id !== sourceProjectId)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>

            <div>
              <Label>Notizen</Label>
              <Textarea
                value={notizen}
                onChange={(e) => setNotizen(e.target.value)}
                placeholder="Optional..."
                rows={2}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canProceedStep1()}>
                Weiter <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Products */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Selected items */}
            {selectedItems.length > 0 && (
              <div className="space-y-2">
                <Label>Ausgewählte Positionen ({selectedItems.length})</Label>
                {selectedItems.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span className="flex-1 text-sm truncate">{item.product.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => updateMenge(item.product.id, item.menge - 1)}
                        disabled={item.menge <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.menge}
                        onChange={(e) => updateMenge(item.product.id, parseFloat(e.target.value) || 1)}
                        className="w-16 h-7 text-center text-sm"
                        min={0.001}
                        step="any"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => updateMenge(item.product.id, item.menge + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground w-10">{item.product.einheit}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => removeItem(item.product.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Product search */}
            <div className="space-y-2">
              <Label>Produkt hinzufügen</Label>
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Suchen..."
              />
              <div className="flex gap-1 flex-wrap">
                <Badge
                  variant={productCategoryFilter === "all" ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setProductCategoryFilter("all")}
                >
                  Alle
                </Badge>
                {CATEGORY_OPTIONS.map((cat) => (
                  <Badge
                    key={cat}
                    variant={productCategoryFilter === cat ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setProductCategoryFilter(cat)}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Badge>
                ))}
              </div>
              <div className="max-h-40 overflow-y-auto border rounded space-y-0">
                {filteredProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Keine Produkte</p>
                ) : (
                  filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                      onClick={() => addItem(p)}
                    >
                      <div>
                        <span className="text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({p.current_stock} {p.einheit})
                        </span>
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedStep2()}>
                Weiter <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Photos */}
        {step === 3 && (
          <div className="space-y-4">
            <Label>Fotos (min. 1) *</Label>

            {photoPreviewUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photoPreviewUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-24 object-cover rounded" />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0"
                      onClick={() => removePhoto(i)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Foto aufnehmen / hochladen</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
              multiple
            />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
              </Button>
              <Button onClick={() => setStep(4)} disabled={!canProceedStep3()}>
                Weiter <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Signature */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label>Name des Mitarbeiters</Label>
              <Input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Vor- und Nachname"
              />
            </div>

            <div>
              <Label>Unterschrift *</Label>
              <SignaturePad onSignatureChange={setSignature} />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
              </Button>
              <Button onClick={handleSave} disabled={!canSave() || saving}>
                {saving ? "Speichern..." : "Lieferschein erstellen"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
