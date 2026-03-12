import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "@/components/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

type ChecklistItem = {
  id: string;
  category: string;
  question: string;
};

interface Props {
  evaluationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function EmployeeEvaluationSheet({ evaluationId, open, onOpenChange, onDone }: Props) {
  const { toast } = useToast();
  const [titel, setTitel] = useState("");
  const [typ, setTyp] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && evaluationId) {
      loadData(evaluationId);
    } else {
      setChecked({});
      setSignature(null);
    }
  }, [open, evaluationId]);

  const loadData = async (evalId: string) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: evalData }, { data: empData }] = await Promise.all([
      supabase
        .from("safety_evaluations")
        .select("titel, typ, checklist_items")
        .eq("id", evalId)
        .single(),
      supabase
        .from("employees")
        .select("vorname, nachname")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (evalData) {
      setTitel(evalData.titel);
      setTyp(evalData.typ);
      const rawItems = Array.isArray(evalData.checklist_items) ? evalData.checklist_items as ChecklistItem[] : [];
      setItems(rawItems);
      const initialChecked: Record<string, boolean> = {};
      rawItems.forEach((item) => { initialChecked[item.id] = false; });
      setChecked(initialChecked);
    }

    if (empData) {
      setEmployeeName(`${empData.vorname} ${empData.nachname}`.trim());
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!evaluationId || !signature) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const personalAnswers = items.map((item) => ({
      item_id: item.id,
      checked: checked[item.id] ?? false,
      bemerkung: null,
    }));

    const { error } = await supabase.from("safety_evaluation_signatures").insert({
      evaluation_id: evaluationId,
      user_id: user.id,
      unterschrift: signature,
      unterschrift_name: employeeName || "Unbekannt",
      personal_answers: personalAnswers,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Erfolgreich unterschrieben", description: "Deine Unterschrift wurde gespeichert." });
      onDone();
      onOpenChange(false);
    }
    setSaving(false);
  };

  // Group items by category
  const categories = [...new Set(items.map((i) => i.category))];
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const typLabel = typ === "evaluierung" ? "Evaluierung" : "Sicherheitsunterweisung";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] overflow-y-auto p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-4 pt-4 pb-3 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="h-5 w-5 text-orange-600 shrink-0" />
              <span className="flex-1 text-left">{titel || "Unterweisung"}</span>
              {typ && (
                <Badge variant="outline" className="text-xs">{typLabel}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Lädt...</p>
            ) : (
              <>
                {/* Checklist */}
                {items.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Checkliste ({checkedCount}/{items.length} abgehakt)
                      </p>
                    </div>

                    {categories.map((cat) => (
                      <div key={cat}>
                        {cat && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 border-b pb-1">
                            {cat}
                          </p>
                        )}
                        <div className="space-y-2">
                          {items
                            .filter((i) => i.category === cat)
                            .map((item) => (
                              <label
                                key={item.id}
                                className="flex items-start gap-3 p-2.5 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
                              >
                                <Checkbox
                                  checked={checked[item.id] ?? false}
                                  onCheckedChange={(val) =>
                                    setChecked((prev) => ({ ...prev, [item.id]: !!val }))
                                  }
                                  className="mt-0.5 shrink-0"
                                />
                                <span className="text-sm leading-snug">{item.question}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Keine Checklistenpunkte vorhanden.
                  </p>
                )}

                {/* Signature */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Unterschrift — {employeeName || "Mitarbeiter"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Mit deiner Unterschrift bestätigst du, dass du die Unterweisung zur Kenntnis genommen hast.
                  </p>
                  <SignaturePad onSignatureChange={setSignature} height={150} />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-4 border-t bg-background sticky bottom-0">
            <Button
              className="w-full"
              disabled={!signature || saving || loading}
              onClick={handleSave}
            >
              {saving ? "Wird gespeichert..." : "Unterschrift speichern"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
