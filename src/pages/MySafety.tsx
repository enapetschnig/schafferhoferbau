import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Clock, CheckCircle2, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeEvaluationSheet } from "@/components/safety/EmployeeEvaluationSheet";

type SignedEvaluation = {
  evaluation_id: string;
  unterschrieben_am: string;
  titel: string;
  typ: string;
  projekt_name: string;
  status: string;
};

type PendingEvaluation = {
  evaluation_id: string;
  titel: string;
  typ: string;
  projekt_name: string;
  status: string;
  created_at: string;
};

export default function MySafety() {
  const navigate = useNavigate();
  const [signed, setSigned] = useState<SignedEvaluation[]>([]);
  const [pending, setPending] = useState<PendingEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Signed evaluations
    const { data: sigData } = await supabase
      .from("safety_evaluation_signatures")
      .select("evaluation_id, unterschrieben_am")
      .eq("user_id", user.id)
      .order("unterschrieben_am", { ascending: false });

    // Assigned evaluations (for pending)
    const { data: empData } = await supabase
      .from("safety_evaluation_employees")
      .select("evaluation_id")
      .eq("user_id", user.id);

    const signedIds = (sigData || []).map((s: any) => s.evaluation_id);
    const allIds = [...new Set([
      ...(sigData || []).map((s: any) => s.evaluation_id),
      ...(empData || []).map((e: any) => e.evaluation_id),
    ])];

    if (allIds.length > 0) {
      const { data: evals } = await supabase
        .from("safety_evaluations")
        .select("id, titel, typ, project_id, status, created_at")
        .in("id", allIds);

      if (evals) {
        // Fetch project names
        const projectIds = [...new Set(evals.map((e: any) => e.project_id))];
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds);
        const projMap = Object.fromEntries((projects || []).map((p: any) => [p.id, p.name]));

        // Build signed list
        const signedList: SignedEvaluation[] = (sigData || [])
          .map((sig: any) => {
            const ev = evals.find((e: any) => e.id === sig.evaluation_id);
            if (!ev) return null;
            return {
              evaluation_id: sig.evaluation_id,
              unterschrieben_am: sig.unterschrieben_am,
              titel: ev.titel,
              typ: ev.typ,
              projekt_name: projMap[ev.project_id] || "–",
              status: ev.status,
            };
          })
          .filter(Boolean) as SignedEvaluation[];
        setSigned(signedList);

        // Build pending list
        const pendingIds = (empData || [])
          .map((e: any) => e.evaluation_id)
          .filter((eid: string) => !signedIds.includes(eid));
        const pendingList: PendingEvaluation[] = pendingIds
          .map((eid: string) => {
            const ev = evals.find((e: any) => e.id === eid);
            if (!ev) return null;
            return {
              evaluation_id: eid,
              titel: ev.titel,
              typ: ev.typ,
              projekt_name: projMap[ev.project_id] || "–",
              status: ev.status,
              created_at: ev.created_at,
            };
          })
          .filter(Boolean) as PendingEvaluation[];
        setPending(pendingList);
      }
    }

    setLoading(false);
  };

  const typLabel = (typ: string) =>
    typ === "evaluierung" ? "Evaluierung" : "Sicherheitsunterweisung";

  const annualEvals = signed.filter(
    (s) =>
      s.typ === "evaluierung" &&
      new Date(s.unterschrieben_am).getFullYear() === currentYear
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Arbeitsschutz" backPath="/" />
        <div className="container mx-auto p-4"><p>Lade...</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Arbeitsschutz" backPath="/" />

      <div className="container mx-auto p-4 max-w-4xl">
        {/* Pending alert */}
        {pending.length > 0 && (
          <Card className="mb-4 border-orange-300 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-600" />
                <span className="font-medium text-orange-800">
                  {pending.length} ausstehende Unterweisung{pending.length > 1 ? "en" : ""}
                </span>
              </div>
              <p className="text-sm text-orange-700 mb-3">
                Bitte unterschreiben Sie die folgenden Dokumente.
              </p>
              <div className="space-y-2">
                {pending.map((p) => (
                  <div
                    key={p.evaluation_id}
                    className="flex items-center justify-between bg-white rounded-md p-2.5 border"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{p.titel}</span>
                      <p className="text-xs text-muted-foreground">{p.projekt_name}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setSelectedEvalId(p.evaluation_id)}
                    >
                      Ausfüllen & Unterschreiben
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="signed">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signed">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Meine Unterweisungen
            </TabsTrigger>
            <TabsTrigger value="annual">
              <FileText className="w-4 h-4 mr-1.5" />
              Jahresevaluierung {currentYear}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Unterschriebene Unterweisungen</CardTitle>
                <CardDescription>
                  Alle Evaluierungen und Sicherheitsunterweisungen, die Sie unterschrieben haben
                </CardDescription>
              </CardHeader>
              <CardContent>
                {signed.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-3" />
                    <p className="text-sm">Noch keine unterschriebenen Unterweisungen</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {signed.map((s) => (
                      <div
                        key={`${s.evaluation_id}-${s.unterschrieben_am}`}
                        className="flex items-center justify-between p-3 border rounded-md hover:bg-accent cursor-pointer"
                        onClick={() => navigate(`/safety-evaluations/${s.evaluation_id}`)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{s.titel}</span>
                            <Badge variant="outline" className="text-xs">{typLabel(s.typ)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.projekt_name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-muted-foreground">
                            {new Date(s.unterschrieben_am).toLocaleDateString("de-AT")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="annual" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Jahresevaluierung {currentYear}</CardTitle>
                <CardDescription>
                  Ihre Evaluierungen für das aktuelle Jahr
                </CardDescription>
              </CardHeader>
              <CardContent>
                {annualEvals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-3" />
                    <p className="text-sm">Noch keine Jahresevaluierung für {currentYear}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {annualEvals.map((s) => (
                      <div
                        key={s.evaluation_id}
                        className="flex items-center justify-between p-3 border rounded-md hover:bg-accent cursor-pointer"
                        onClick={() => navigate(`/safety-evaluations/${s.evaluation_id}`)}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{s.titel}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.projekt_name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-muted-foreground">
                            {new Date(s.unterschrieben_am).toLocaleDateString("de-AT")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <EmployeeEvaluationSheet
        evaluationId={selectedEvalId}
        open={!!selectedEvalId}
        onOpenChange={(open) => { if (!open) setSelectedEvalId(null); }}
        onDone={() => { setSelectedEvalId(null); fetchData(); }}
      />
    </div>
  );
}
