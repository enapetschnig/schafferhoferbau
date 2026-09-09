import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Type } from "lucide-react";

/**
 * Kurze Hilfe zur Chat-Formatierung.
 *
 * Gemeldet von Franz (08.09.2026): Er wuenschte sich Fett/Kursiv/Listen im
 * Chat - vieles gab es schon, war aber nirgends erklaert. Der Knopf sitzt
 * bewusst links bei Kamera und Bueroklammer, nicht rechts beim Senden-Knopf.
 */
const ZEILEN: { probe: string; erklaerung: string }[] = [
  { probe: "*fett*", erklaerung: "fett" },
  { probe: "_kursiv_", erklaerung: "kursiv" },
  { probe: "~durchgestrichen~", erklaerung: "durchgestrichen" },
  { probe: "`Code`", erklaerung: "Code" },
  { probe: "- Punkt", erklaerung: "Aufzählung" },
  { probe: "1. Punkt", erklaerung: "Nummerierung" },
];

export function ChatFormatHilfe() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          title="Textformatierung"
          aria-label="Textformatierung"
          data-bildschirmfoto="aus"
        >
          <Type className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-sm font-medium mb-2">Text formatieren</p>
        <div className="space-y-1.5">
          {ZEILEN.map((z) => (
            <div key={z.probe} className="flex items-center justify-between gap-3 text-sm">
              <code className="px-1.5 py-0.5 rounded bg-muted text-xs">{z.probe}</code>
              <span className="text-muted-foreground text-xs">{z.erklaerung}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
          Neue Zeile: Umschalt-, Strg- oder Alt-Taste zusammen mit Enter.
        </p>
      </PopoverContent>
    </Popover>
  );
}
