# Schafferhofer Bau — Projektdokumentation

Individuelle App für **Schafferhofer Bau**. Bauprojekte, Zeiterfassung,
Arbeitssicherheit, Lager, Buchhaltung, Chat.

> Dieses Dokument beschreibt nur, **was ist** — es enthält keine Vorgaben,
> wie gearbeitet werden soll.

---

## Stack

| | |
|---|---|
| Frontend | React 18 + TypeScript, Vite |
| UI | shadcn/ui (Radix) + Tailwind, Alias `@` → `src/` |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| PWA | `vite-plugin-pwa` + Web-Push (VAPID) |
| Deploy | Vercel, SPA-Rewrite in `vercel.json` |
| Tests | Playwright (`tests/`, 25 Specs) **und** Vitest (Unit, in `src/`) |
| Git | `main` → `git@github.com:enapetschnig/schafferhoferbau.git` |

**Supabase:** `fxsjhdsitwtjasxbmksr` — `.env` und `config.toml` stimmen überein.

**Umgebungsvariablen:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`

Primärfarbe: `--primary: 2 96% 43%` (Rot) in `src/index.css`

## Befehle

```bash
npm run dev         # Dev-Server
npm run build       # Produktions-Build
npm run lint        # ESLint
npm run test        # Vitest (Unit-Tests in src/)
npm run test:watch
npx playwright test # E2E
```

**Zur Testtrennung** — Kommentar aus `vitest.config.ts`:

> *„Eigene Vitest-Config: nur Unit-Tests in `src/`, NICHT die Playwright-E2E-
> Tests im `tests/`-Verzeichnis (die werden separat über `playwright test`
> ausgeführt und werfen sonst beim Vitest-Run Errors)."*

---

## Herkunft

Fork der gemeinsamen Ur-App (Basis `20251105065433_33daeb17-…`).
Seither 149 eigene Migrations, letzte: `20260710010000_profiles_sort_order.sql`.

**Nächster Verwandter: `bmrbau`.** Fast baugleich — gleiche Modulauswahl,
fast identische Playwright-Specs, dieselben Edge Functions bis auf zwei.

**Wo sich die beiden unterscheiden:**

| | schafferhoferbau | bmrbau |
|---|---|---|
| Chat | ✅ aktiv | ❌ per Flag abgeschaltet |
| Buchhaltung | ✅ `Buchhaltung.tsx` | — |
| Speicherübersicht | ✅ `CloudData.tsx` | — |
| Meine Sicherheit | ✅ `MySafety.tsx` | — |
| Aufmaß | — | ✅ `AufmassEditor`/`AufmassList` |
| Zeitausgleich (ZA) | — | ✅ eigenes Teilsystem |
| BUAK-Kalender | — | ✅ |
| Mitarbeiterkonto | `create-employee-account` | `create-team-time-entries` u. a. |
| Unit-Tests | ✅ Vitest | — |

---

## Rollen

Enum `app_role`: `administrator` | `mitarbeiter`
Zusätzlich im Code: `vorarbeiter`, `extern`.

Routen werden über `ProtectedRoute` mit `minRole` abgesichert, z. B.
`<ProtectedRoute minRole="extern">` für den Projekt-Chat.

---

## Module

`src/pages/` — 45 Seiten:

**Projekte**
`Projects`, `ProjectDetail`, `ProjectOverview`, `Reports`

**Zeiterfassung**
`TimeTracking`, `MyHours`, `HoursReport`, `ExternalTimeTracking`,
`LegalWorkTimeReport`

**Arbeitssicherheit** — 8 Seiten
`SafetyHub`, `SafetyEvaluations`, `SafetyEvaluationDetail`, `SafetyCompletion`,
`SafetyErinnerungen`, `SafetyNachweise`, `SafetySchulungen`, `MySafety`
Komponenten in `src/components/safety/`

**Lager & Geräte**
`Warehouse`, `Bestellungen`, `OrderManagement`, `Equipment`, `EquipmentDetail`
Komponenten in `src/components/warehouse/`

**Bautagesberichte**
`DailyReports`, `DailyReportDetail`

**Buchhaltung**
`Buchhaltung` — Excel-Export über `lib/generateBuchhaltungExcel.ts`

**Dokumente & Speicher**
`DocumentLibrary`, `IncomingDocuments`, `IncomingInvoices`, `MyDocuments`,
`CloudData` (Übersicht über belegten Speicher, Dateien, Tabellen)

**Chat** — aktiv
`CompanyChatPage`, `ProjectChatPage`
Hilfsdateien: `lib/formatChatText.tsx`, `lib/chatInputKeyHandler.ts` (beide mit
Unit-Tests)

**Planung**
`ScheduleBoard` (Plantafel), Hook `useEmployeeSchedule.ts`

**Schlechtwetter**
`BadWeather`

**Sonstiges**
`Employees`, `Invoices`, `InvoiceDetail`, `Disturbances`, `DisturbanceDetail`,
`Notepad`, `Dashboard`, `Admin`, `Auth`, `Index`, `NotFound`

---

## Edge Functions

`supabase/functions/` — 15 Stück:

`ai-import-equipment` · `compare-documents` (`verify_jwt = false`) ·
`create-employee-account` · `create-team-time-entries` · `extract-document` ·
`extract-materials` · `generate-invoice-pdf` · `improve-text` ·
`migrate-sick-notes` · `parse-safety-checklist` · `send-disturbance-report` ·
`send-invitation` · `send-push` · `split-payslips` · `transcribe-audio`

---

## Fachlogik in `src/lib/`

**PDF & Export**
`generateDailyReportPDF`, `generateDisturbancePDF`, `generateHoursReportPDF`,
`generateLegalWorkTimePDF`, `generateSafetyEvaluationPDF`,
`generateBuchhaltungExcel`, `pdfHelpers`, `pdfjsSetup`, `pdfjsWorker`

**Zeit & Recht**
`workingHours` (+ Test), `austrianHolidays`, `timeUtils`,
`azgSignatures` (Arbeitszeitgesetz-Freigaben, ZA-Saldo, Schwellenwerte)

**Chat**
`formatChatText` (+ Test), `chatInputKeyHandler` (+ Test)

**Dateien & Bilder**
`storageFileName` (+ Test), `dailyReportPhotos`, `imageOrientation`, `polyfills`

## Hooks

`useAppSettings`, `useAvailableEmployees`, `useEmployeeSchedule`,
`useProjectWeather`, `usePushNotifications`

---

## Besonderheiten

- **Die einzige App mit Vitest-Unit-Tests** neben monti.pro — 5 Testdateien
  liegen direkt neben dem Code in `src/lib/`
- **Buchhaltungs-Export nach Excel**
- **`azgSignatures.ts`** — Arbeitszeitgesetz-Logik mit Saldo und Schwellenwerten
- **`CloudData.tsx`** — zeigt dem Kunden, was seine Daten an Speicher belegen
- **Web-Push** (VAPID), im Portfolio nur hier und bei bmrbau
- `scripts/generate-icons.py` erzeugt die PWA-Icons
