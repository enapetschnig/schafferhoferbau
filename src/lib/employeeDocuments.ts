import { sanitizeStorageFileName } from "@/lib/storageFileName";

/**
 * Personalunterlagen je Mitarbeiter (Anmeldungen, Dienstvertraege, Zeugnisse).
 * Liegen im bestehenden Bucket 'employee-documents' neben lohnzettel/krankmeldung.
 */
export const PERSONAL_DOCUMENT_CATEGORIES = [
  { id: "anmeldung", label: "Anmeldungen" },
  { id: "dienstvertrag", label: "Dienstverträge" },
  { id: "zeugnis", label: "Zeugnisse" },
  { id: "sonstiges", label: "Sonstiges" },
] as const;

export type PersonalDocumentCategory =
  (typeof PERSONAL_DOCUMENT_CATEGORIES)[number]["id"];

const CATEGORY_IDS = PERSONAL_DOCUMENT_CATEGORIES.map((c) => c.id) as readonly string[];

export function isPersonalDocumentCategory(
  value: string
): value is PersonalDocumentCategory {
  return CATEGORY_IDS.includes(value);
}

export function personalCategoryLabel(kategorie: string): string {
  return (
    PERSONAL_DOCUMENT_CATEGORIES.find((c) => c.id === kategorie)?.label ?? kategorie
  );
}

/** Praefix fuer Unterlagen, die der Mitarbeiter NICHT sehen soll. */
export const INTERNAL_PREFIX = "intern";

export interface BuildPathOptions {
  /** auth.users.id - fehlt bei Mitarbeitern ohne App-Zugang */
  userId: string | null | undefined;
  /** employees.id - Fallback, wenn kein App-Zugang besteht */
  employeeId: string;
  kategorie: PersonalDocumentCategory;
  /** false => Ablage unter intern/, fuer den Mitarbeiter per RLS unerreichbar */
  sichtbar: boolean;
  fileName: string;
  /** Nur fuer Tests injizierbar - sonst Zeitstempel + Zufallssuffix */
  uniqueSuffix?: string;
}

/**
 * Baut den Storage-Pfad einer Personalunterlage.
 *
 *   sichtbar        -> {user_id}/{kategorie}/{suffix}_{name}
 *   nur intern      -> intern/{user_id}/{kategorie}/{suffix}_{name}
 *   ohne App-Zugang -> intern/{employee_id}/{kategorie}/{suffix}_{name}
 *
 * Ohne App-Zugang gibt es niemanden, der das Dokument sehen koennte - solche
 * Unterlagen landen daher immer unter intern/, unabhaengig von `sichtbar`.
 */
export function buildEmployeeDocumentPath({
  userId,
  employeeId,
  kategorie,
  sichtbar,
  fileName,
  uniqueSuffix,
}: BuildPathOptions): string {
  const suffix =
    uniqueSuffix ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = sanitizeStorageFileName(fileName);
  const owner = userId || employeeId;
  const visible = sichtbar && !!userId;

  const base = `${owner}/${kategorie}/${suffix}_${safeName}`;
  return visible ? base : `${INTERNAL_PREFIX}/${base}`;
}

/**
 * Ob eine Unterlage tatsaechlich beim Mitarbeiter ankommen kann. Ohne
 * App-Zugang ist das nie der Fall - das UI deaktiviert das Haekchen dann.
 */
export function canBeVisibleToEmployee(userId: string | null | undefined): boolean {
  return !!userId;
}

/** Vorschlag fuer die Bezeichnung: Dateiname ohne Endung, Trennzeichen zu Leerzeichen. */
export function suggestBezeichnung(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").trim() || fileName;
}

// ---------------------------------------------------------------------------
// Ordner (eine Ebene innerhalb einer Kategorie)
// ---------------------------------------------------------------------------

export interface EmployeeDocumentFolder {
  id: string;
  kategorie: string;
  name: string;
  sort_order: number;
}

/** Bezeichnung der Sammelgruppe fuer Dokumente ohne Ordner. */
export const UNFILED_LABEL = "Ohne Ordner";

export interface FolderGroup<T> {
  /** null = Sammelgruppe fuer Dokumente ohne Ordnerzuordnung */
  folder: EmployeeDocumentFolder | null;
  documents: T[];
}

/** Ordner nach sort_order, bei Gleichstand alphabetisch (deutsche Sortierung). */
export function sortFolders<T extends EmployeeDocumentFolder>(folders: T[]): T[] {
  return [...folders].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "de")
  );
}

/**
 * Gruppiert Dokumente nach Ordner. Die Sammelgruppe "ohne Ordner" kommt immer
 * zuletzt - so stehen die gepflegten Ordner oben.
 *
 * @param includeEmpty Leere Ordner mit ausgeben (Admin-Ansicht: ja, damit ein
 *   frisch angelegter Ordner sichtbar ist; Mitarbeiter-Ansicht: nein).
 */
export function groupDocumentsByFolder<T extends { folder_id?: string | null }>(
  documents: T[],
  folders: EmployeeDocumentFolder[],
  includeEmpty = false
): FolderGroup<T>[] {
  const byFolder = new Map<string, T[]>();
  const unfiled: T[] = [];

  for (const doc of documents) {
    if (doc.folder_id) {
      const list = byFolder.get(doc.folder_id);
      if (list) list.push(doc);
      else byFolder.set(doc.folder_id, [doc]);
    } else {
      unfiled.push(doc);
    }
  }

  const groups: FolderGroup<T>[] = [];
  for (const folder of sortFolders(folders)) {
    const docs = byFolder.get(folder.id) || [];
    if (docs.length > 0 || includeEmpty) {
      groups.push({ folder, documents: docs });
    }
    byFolder.delete(folder.id);
  }

  // Dokumente, deren Ordner nicht (mehr) in der Liste steht, nicht verschlucken
  for (const orphaned of byFolder.values()) unfiled.push(...orphaned);

  if (unfiled.length > 0) groups.push({ folder: null, documents: unfiled });

  return groups;
}
