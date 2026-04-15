export type WarehouseProductCategory =
  | "kanaele"
  | "betonzubehoer"
  | "daemmung"
  | "kleinteile"
  | "baugeraete"
  | "schalungen";

export type WarehouseTransferType =
  | "lager_to_baustelle"
  | "baustelle_to_lager"
  | "baustelle_to_baustelle";

export type WarehouseProduct = {
  id: string;
  name: string;
  category: WarehouseProductCategory;
  einheit: string;
  ek_preis: number | null;
  aufschlag_prozent: number | null;
  rechnungsdatum: string | null;
  lieferdatum: string | null;
  lieferant: string | null;
  current_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WarehouseDeliveryNote = {
  id: string;
  transfer_type: WarehouseTransferType;
  source_project_id: string | null;
  target_project_id: string | null;
  user_id: string;
  datum: string;
  photo_urls: string[];
  unterschrift: string;
  unterschrift_name: string | null;
  notizen: string | null;
  parent_note_id: string | null;
  created_at: string;
  // Joined fields:
  source_project_name?: string;
  target_project_name?: string;
  employee_name?: string;
  items?: WarehouseDeliveryNoteItem[];
};

export type WarehouseDeliveryNoteItem = {
  id: string;
  delivery_note_id: string;
  product_id: string;
  menge: number;
  created_at: string;
  // Joined:
  product_name?: string;
  product_einheit?: string;
};

export const CATEGORY_LABELS: Record<WarehouseProductCategory, string> = {
  kanaele: "Kanäle",
  betonzubehoer: "Betonzubehör",
  daemmung: "Dämmung",
  kleinteile: "Kleinteile",
  baugeraete: "Baugeräte",
  schalungen: "Schalungen",
};

export const CATEGORY_OPTIONS: WarehouseProductCategory[] = [
  "kanaele",
  "betonzubehoer",
  "daemmung",
  "kleinteile",
  "baugeraete",
  "schalungen",
];

export const TRANSFER_TYPE_LABELS: Record<
  WarehouseTransferType,
  { label: string; color: string }
> = {
  lager_to_baustelle: {
    label: "Lager → Baustelle",
    color: "bg-blue-100 text-blue-800",
  },
  baustelle_to_lager: {
    label: "Baustelle → Lager",
    color: "bg-green-100 text-green-800",
  },
  baustelle_to_baustelle: {
    label: "Baustelle → Baustelle",
    color: "bg-orange-100 text-orange-800",
  },
};
