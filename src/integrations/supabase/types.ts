export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bad_weather_records: {
        Row: {
          arbeitsstunden_vor_schlechtwetter: number | null
          arbeitsstunden_waehrend_sw: number | null
          beginn_schlechtwetter: string
          created_at: string | null
          datum: string
          ende_schlechtwetter: string
          gearbeitet_waehrend_sw: boolean | null
          id: string
          notizen: string | null
          project_id: string
          projekt_adresse: string | null
          schlechtwetter_stunden: number
          updated_at: string | null
          user_id: string
          wetter_art: string[] | null
        }
        Insert: {
          arbeitsstunden_vor_schlechtwetter?: number | null
          arbeitsstunden_waehrend_sw?: number | null
          beginn_schlechtwetter: string
          created_at?: string | null
          datum: string
          ende_schlechtwetter: string
          gearbeitet_waehrend_sw?: boolean | null
          id?: string
          notizen?: string | null
          project_id: string
          projekt_adresse?: string | null
          schlechtwetter_stunden: number
          updated_at?: string | null
          user_id: string
          wetter_art?: string[] | null
        }
        Update: {
          arbeitsstunden_vor_schlechtwetter?: number | null
          arbeitsstunden_waehrend_sw?: number | null
          beginn_schlechtwetter?: string
          created_at?: string | null
          datum?: string
          ende_schlechtwetter?: string
          gearbeitet_waehrend_sw?: boolean | null
          id?: string
          notizen?: string | null
          project_id?: string
          projekt_adresse?: string | null
          schlechtwetter_stunden?: number
          updated_at?: string | null
          user_id?: string
          wetter_art?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "bad_weather_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bestellpositionen: {
        Row: {
          artikel: string
          bestellung_id: string
          created_at: string | null
          einheit: string | null
          id: string
          menge: number | null
        }
        Insert: {
          artikel: string
          bestellung_id: string
          created_at?: string | null
          einheit?: string | null
          id?: string
          menge?: number | null
        }
        Update: {
          artikel?: string
          bestellung_id?: string
          created_at?: string | null
          einheit?: string | null
          id?: string
          menge?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bestellpositionen_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      bestellungen: {
        Row: {
          beschreibung: string | null
          created_at: string | null
          dokument_url: string | null
          erstellt_von: string
          id: string
          lieferant: string | null
          notizen: string | null
          produktgruppe: string | null
          project_id: string | null
          status: string
          titel: string
          typ: string
          updated_at: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string | null
          dokument_url?: string | null
          erstellt_von: string
          id?: string
          lieferant?: string | null
          notizen?: string | null
          produktgruppe?: string | null
          project_id?: string | null
          status?: string
          titel: string
          typ?: string
          updated_at?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          beschreibung?: string | null
          created_at?: string | null
          dokument_url?: string | null
          erstellt_von?: string
          id?: string
          lieferant?: string | null
          notizen?: string | null
          produktgruppe?: string | null
          project_id?: string | null
          status?: string
          titel?: string
          typ?: string
          updated_at?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bestellungen_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_messages: {
        Row: {
          channel_id: string | null
          created_at: string | null
          id: string
          image_url: string | null
          message: string | null
          target_roles: string[]
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          message?: string | null
          target_roles?: string[]
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          message?: string | null
          target_roles?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          archived_at: string | null
          channel_type: string
          created_at: string | null
          created_by: string
          id: string
          is_archived: boolean
          name: string
          target_roles: string[] | null
          target_user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          channel_type?: string
          created_at?: string | null
          created_by: string
          id?: string
          is_archived?: boolean
          name: string
          target_roles?: string[] | null
          target_user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          channel_type?: string
          created_at?: string | null
          created_by?: string
          id?: string
          is_archived?: boolean
          name?: string
          target_roles?: string[] | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_holidays: {
        Row: {
          bezeichnung: string | null
          created_at: string | null
          created_by: string
          datum: string
          id: string
          typ: string | null
        }
        Insert: {
          bezeichnung?: string | null
          created_at?: string | null
          created_by: string
          datum: string
          id?: string
          typ?: string | null
        }
        Update: {
          bezeichnung?: string | null
          created_at?: string | null
          created_by?: string
          datum?: string
          id?: string
          typ?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          firma: string | null
          id: string
          name: string
          notizen: string | null
          rolle: string | null
          telefon: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          firma?: string | null
          id?: string
          name: string
          notizen?: string | null
          rolle?: string | null
          telefon?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          firma?: string | null
          id?: string
          name?: string
          notizen?: string | null
          rolle?: string | null
          telefon?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_report_activities: {
        Row: {
          beschreibung: string
          created_at: string | null
          daily_report_id: string
          geschoss: string
          id: string
          sort_order: number | null
        }
        Insert: {
          beschreibung: string
          created_at?: string | null
          daily_report_id: string
          geschoss: string
          id?: string
          sort_order?: number | null
        }
        Update: {
          beschreibung?: string
          created_at?: string | null
          daily_report_id?: string
          geschoss?: string
          id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_activities_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_photos: {
        Row: {
          created_at: string | null
          daily_report_id: string
          file_name: string
          file_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_report_id: string
          file_name: string
          file_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_report_id?: string
          file_name?: string
          file_path?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_photos_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_workers: {
        Row: {
          created_at: string | null
          daily_report_id: string
          id: string
          is_main: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_report_id: string
          id?: string
          is_main?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_report_id?: string
          id?: string
          is_main?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_workers_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          beschreibung: string
          created_at: string | null
          datum: string
          geschoss: string[] | null
          id: string
          interne_anmerkungen: string | null
          ist_zettel_upload: boolean | null
          notizen: string | null
          pdf_gesendet_am: string | null
          project_id: string
          report_type: string
          sicherheit_bestaetigt: boolean | null
          sicherheitscheckliste: Json | null
          status: string | null
          temperatur_max: number | null
          temperatur_min: number | null
          unterschrift_am: string | null
          unterschrift_kunde: string | null
          unterschrift_name: string | null
          updated_at: string | null
          user_id: string
          wetter: string[] | null
          zeit_auf_pdf: boolean
          zettel_scan_url: string | null
        }
        Insert: {
          beschreibung?: string
          created_at?: string | null
          datum: string
          geschoss?: string[] | null
          id?: string
          interne_anmerkungen?: string | null
          ist_zettel_upload?: boolean | null
          notizen?: string | null
          pdf_gesendet_am?: string | null
          project_id: string
          report_type?: string
          sicherheit_bestaetigt?: boolean | null
          sicherheitscheckliste?: Json | null
          status?: string | null
          temperatur_max?: number | null
          temperatur_min?: number | null
          unterschrift_am?: string | null
          unterschrift_kunde?: string | null
          unterschrift_name?: string | null
          updated_at?: string | null
          user_id: string
          wetter?: string[] | null
          zeit_auf_pdf?: boolean
          zettel_scan_url?: string | null
        }
        Update: {
          beschreibung?: string
          created_at?: string | null
          datum?: string
          geschoss?: string[] | null
          id?: string
          interne_anmerkungen?: string | null
          ist_zettel_upload?: boolean | null
          notizen?: string | null
          pdf_gesendet_am?: string | null
          project_id?: string
          report_type?: string
          sicherheit_bestaetigt?: boolean | null
          sicherheitscheckliste?: Json | null
          status?: string | null
          temperatur_max?: number | null
          temperatur_min?: number | null
          unterschrift_am?: string | null
          unterschrift_kunde?: string | null
          unterschrift_name?: string | null
          updated_at?: string | null
          user_id?: string
          wetter?: string[] | null
          zeit_auf_pdf?: boolean
          zettel_scan_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          order_id: string
          photo_url: string
          project_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          photo_url: string
          project_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          photo_url?: string
          project_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbance_materials: {
        Row: {
          created_at: string
          disturbance_id: string
          id: string
          material: string
          menge: string | null
          notizen: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disturbance_id: string
          id?: string
          material: string
          menge?: string | null
          notizen?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disturbance_id?: string
          id?: string
          material?: string
          menge?: string | null
          notizen?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbance_materials_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbance_photos: {
        Row: {
          created_at: string
          disturbance_id: string
          file_name: string
          file_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disturbance_id: string
          file_name: string
          file_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disturbance_id?: string
          file_name?: string
          file_path?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbance_photos_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbance_workers: {
        Row: {
          created_at: string
          disturbance_id: string
          id: string
          is_main: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          disturbance_id: string
          id?: string
          is_main?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          disturbance_id?: string
          id?: string
          is_main?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbance_workers_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbances: {
        Row: {
          beschreibung: string
          created_at: string
          datum: string
          end_time: string
          geschoss: string[] | null
          id: string
          is_verrechnet: boolean
          kunde_adresse: string | null
          kunde_email: string | null
          kunde_name: string
          kunde_telefon: string | null
          notizen: string | null
          pause_minutes: number
          pdf_gesendet_am: string | null
          start_time: string
          status: string
          stunden: number
          temperatur_max: number | null
          temperatur_min: number | null
          unterschrift_am: string | null
          unterschrift_kunde: string | null
          updated_at: string
          user_id: string
          wetter: string[] | null
        }
        Insert: {
          beschreibung: string
          created_at?: string
          datum: string
          end_time: string
          geschoss?: string[] | null
          id?: string
          is_verrechnet?: boolean
          kunde_adresse?: string | null
          kunde_email?: string | null
          kunde_name: string
          kunde_telefon?: string | null
          notizen?: string | null
          pause_minutes?: number
          pdf_gesendet_am?: string | null
          start_time: string
          status?: string
          stunden: number
          temperatur_max?: number | null
          temperatur_min?: number | null
          unterschrift_am?: string | null
          unterschrift_kunde?: string | null
          updated_at?: string
          user_id: string
          wetter?: string[] | null
        }
        Update: {
          beschreibung?: string
          created_at?: string
          datum?: string
          end_time?: string
          geschoss?: string[] | null
          id?: string
          is_verrechnet?: boolean
          kunde_adresse?: string | null
          kunde_email?: string | null
          kunde_name?: string
          kunde_telefon?: string | null
          notizen?: string | null
          pause_minutes?: number
          pdf_gesendet_am?: string | null
          start_time?: string
          status?: string
          stunden?: number
          temperatur_max?: number | null
          temperatur_min?: number | null
          unterschrift_am?: string | null
          unterschrift_kunde?: string | null
          updated_at?: string
          user_id?: string
          wetter?: string[] | null
        }
        Relationships: []
      }
      document_library_categories: {
        Row: {
          created_at: string | null
          id: string
          key: string
          label: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          label: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      document_library_favorites: {
        Row: {
          created_at: string
          file_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      document_library_links: {
        Row: {
          category_key: string
          created_at: string | null
          created_by: string
          id: string
          sort_order: number | null
          title: string
          url: string
        }
        Insert: {
          category_key: string
          created_at?: string | null
          created_by: string
          id?: string
          sort_order?: number | null
          title: string
          url: string
        }
        Update: {
          category_key?: string
          created_at?: string | null
          created_by?: string
          id?: string
          sort_order?: number | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      document_library_meta: {
        Row: {
          beschreibung: string | null
          bezeichnung: string | null
          created_at: string
          file_path: string
          updated_at: string
        }
        Insert: {
          beschreibung?: string | null
          bezeichnung?: string | null
          created_at?: string
          file_path: string
          updated_at?: string
        }
        Update: {
          beschreibung?: string | null
          bezeichnung?: string | null
          created_at?: string
          file_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          archived: boolean | null
          beschreibung: string | null
          bezeichnung: string | null
          created_at: string
          file_url: string | null
          id: string
          name: string
          project_id: string
          sub_type: string | null
          text_content: string | null
          typ: string
          user_id: string
        }
        Insert: {
          archived?: boolean | null
          beschreibung?: string | null
          bezeichnung?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          name: string
          project_id: string
          sub_type?: string | null
          text_content?: string | null
          typ: string
          user_id: string
        }
        Update: {
          archived?: boolean | null
          beschreibung?: string | null
          bezeichnung?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          name?: string
          project_id?: string
          sub_type?: string | null
          text_content?: string | null
          typ?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          adresse: string | null
          austritt_datum: string | null
          bank_name: string | null
          beschaeftigung_art: string | null
          bic: string | null
          created_at: string | null
          eintritt_datum: string | null
          email: string | null
          geburtsdatum: string | null
          iban: string | null
          id: string
          is_external: boolean | null
          kategorie: string | null
          kleidungsgroesse: string | null
          land: string | null
          nachname: string
          notizen: string | null
          ort: string | null
          plz: string | null
          position: string | null
          regelarbeitszeit: Json | null
          schuhgroesse: string | null
          schwellenwert: Json | null
          sichtbarkeit: Json | null
          stundenlohn: number | null
          sv_nummer: string | null
          telefon: string | null
          updated_at: string | null
          urlaub_einheit_preferred: string | null
          user_id: string | null
          vorname: string
          wochen_soll_stunden: number | null
        }
        Insert: {
          adresse?: string | null
          austritt_datum?: string | null
          bank_name?: string | null
          beschaeftigung_art?: string | null
          bic?: string | null
          created_at?: string | null
          eintritt_datum?: string | null
          email?: string | null
          geburtsdatum?: string | null
          iban?: string | null
          id?: string
          is_external?: boolean | null
          kategorie?: string | null
          kleidungsgroesse?: string | null
          land?: string | null
          nachname: string
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          regelarbeitszeit?: Json | null
          schuhgroesse?: string | null
          schwellenwert?: Json | null
          sichtbarkeit?: Json | null
          stundenlohn?: number | null
          sv_nummer?: string | null
          telefon?: string | null
          updated_at?: string | null
          urlaub_einheit_preferred?: string | null
          user_id?: string | null
          vorname: string
          wochen_soll_stunden?: number | null
        }
        Update: {
          adresse?: string | null
          austritt_datum?: string | null
          bank_name?: string | null
          beschaeftigung_art?: string | null
          bic?: string | null
          created_at?: string | null
          eintritt_datum?: string | null
          email?: string | null
          geburtsdatum?: string | null
          iban?: string | null
          id?: string
          is_external?: boolean | null
          kategorie?: string | null
          kleidungsgroesse?: string | null
          land?: string | null
          nachname?: string
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          regelarbeitszeit?: Json | null
          schuhgroesse?: string | null
          schwellenwert?: Json | null
          sichtbarkeit?: Json | null
          stundenlohn?: number | null
          sv_nummer?: string | null
          telefon?: string | null
          updated_at?: string | null
          urlaub_einheit_preferred?: string | null
          user_id?: string | null
          vorname?: string
          wochen_soll_stunden?: number | null
        }
        Relationships: []
      }
      equipment: {
        Row: {
          created_at: string
          foto_url: string | null
          id: string
          kategorie: string
          kaufdatum: string | null
          naechste_wartung: string | null
          name: string
          notizen: string | null
          rechnung_foto_url: string | null
          seriennummer: string | null
          standort_project_id: string | null
          standort_typ: string
          updated_at: string
          wartungsintervall_monate: number | null
          zustand: string
        }
        Insert: {
          created_at?: string
          foto_url?: string | null
          id?: string
          kategorie: string
          kaufdatum?: string | null
          naechste_wartung?: string | null
          name: string
          notizen?: string | null
          rechnung_foto_url?: string | null
          seriennummer?: string | null
          standort_project_id?: string | null
          standort_typ?: string
          updated_at?: string
          wartungsintervall_monate?: number | null
          zustand?: string
        }
        Update: {
          created_at?: string
          foto_url?: string | null
          id?: string
          kategorie?: string
          kaufdatum?: string | null
          naechste_wartung?: string | null
          name?: string
          notizen?: string | null
          rechnung_foto_url?: string | null
          seriennummer?: string | null
          standort_project_id?: string | null
          standort_typ?: string
          updated_at?: string
          wartungsintervall_monate?: number | null
          zustand?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_standort_project_id_fkey"
            columns: ["standort_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_documents: {
        Row: {
          created_at: string
          created_by: string | null
          equipment_id: string
          file_type: string
          file_url: string
          id: string
          name: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipment_id: string
          file_type: string
          file_url: string
          id?: string
          name: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipment_id?: string
          file_type?: string
          file_url?: string
          id?: string
          name?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_documents_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_transfers: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          nach_project_id: string | null
          nach_typ: string
          notizen: string | null
          transferiert_am: string
          transferiert_von: string
          von_project_id: string | null
          von_typ: string
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id?: string
          nach_project_id?: string | null
          nach_typ: string
          notizen?: string | null
          transferiert_am?: string
          transferiert_von: string
          von_project_id?: string | null
          von_typ: string
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          nach_project_id?: string | null
          nach_typ?: string
          notizen?: string | null
          transferiert_am?: string
          transferiert_von?: string
          von_project_id?: string | null
          von_typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_transfers_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_nach_project_id_fkey"
            columns: ["nach_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_transferiert_von_fkey"
            columns: ["transferiert_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_von_project_id_fkey"
            columns: ["von_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_documents: {
        Row: {
          betrag: number | null
          betrag_netto: number | null
          bezahlt_am: string | null
          created_at: string | null
          dokument_datum: string | null
          dokument_nummer: string | null
          id: string
          ist_retour: boolean | null
          lieferant: string | null
          notizen: string | null
          photo_url: string
          positionen: Json | null
          project_id: string
          status: string
          typ: string
          unterschrift: string | null
          unterschrift_name: string | null
          updated_at: string | null
          user_id: string
          waren_fotos_urls: string[] | null
          ziel_projekt_id: string | null
          zusatz_seiten_urls: string[] | null
        }
        Insert: {
          betrag?: number | null
          betrag_netto?: number | null
          bezahlt_am?: string | null
          created_at?: string | null
          dokument_datum?: string | null
          dokument_nummer?: string | null
          id?: string
          ist_retour?: boolean | null
          lieferant?: string | null
          notizen?: string | null
          photo_url: string
          positionen?: Json | null
          project_id: string
          status?: string
          typ: string
          unterschrift?: string | null
          unterschrift_name?: string | null
          updated_at?: string | null
          user_id: string
          waren_fotos_urls?: string[] | null
          ziel_projekt_id?: string | null
          zusatz_seiten_urls?: string[] | null
        }
        Update: {
          betrag?: number | null
          betrag_netto?: number | null
          bezahlt_am?: string | null
          created_at?: string | null
          dokument_datum?: string | null
          dokument_nummer?: string | null
          id?: string
          ist_retour?: boolean | null
          lieferant?: string | null
          notizen?: string | null
          photo_url?: string
          positionen?: Json | null
          project_id?: string
          status?: string
          typ?: string
          unterschrift?: string | null
          unterschrift_name?: string | null
          updated_at?: string | null
          user_id?: string
          waren_fotos_urls?: string[] | null
          ziel_projekt_id?: string | null
          zusatz_seiten_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_documents_ziel_projekt_id_fkey"
            columns: ["ziel_projekt_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_logs: {
        Row: {
          gesendet_am: string | null
          gesendet_von: string | null
          id: string
          status: string | null
          telefonnummer: string
        }
        Insert: {
          gesendet_am?: string | null
          gesendet_von?: string | null
          id?: string
          status?: string | null
          telefonnummer: string
        }
        Update: {
          gesendet_am?: string | null
          gesendet_von?: string | null
          id?: string
          status?: string | null
          telefonnummer?: string
        }
        Relationships: []
      }
      invoice_delivery_matches: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          lieferschein_id: string
          rechnung_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lieferschein_id: string
          rechnung_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lieferschein_id?: string
          rechnung_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_delivery_matches_lieferschein_id_fkey"
            columns: ["lieferschein_id"]
            isOneToOne: false
            referencedRelation: "incoming_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_matches_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "incoming_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          beschreibung: string
          created_at: string
          einheit: string | null
          einzelpreis: number
          gesamtpreis: number
          id: string
          invoice_id: string
          menge: number
          position: number
        }
        Insert: {
          beschreibung: string
          created_at?: string
          einheit?: string | null
          einzelpreis?: number
          gesamtpreis?: number
          id?: string
          invoice_id: string
          menge?: number
          position?: number
        }
        Update: {
          beschreibung?: string
          created_at?: string
          einheit?: string | null
          einzelpreis?: number
          gesamtpreis?: number
          id?: string
          invoice_id?: string
          menge?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          brutto_summe: number
          created_at: string
          datum: string
          faellig_am: string | null
          id: string
          jahr: number
          kunde_adresse: string | null
          kunde_email: string | null
          kunde_land: string | null
          kunde_name: string
          kunde_ort: string | null
          kunde_plz: string | null
          kunde_telefon: string | null
          kunde_uid: string | null
          laufnummer: number
          leistungsdatum: string | null
          mwst_betrag: number
          mwst_satz: number
          netto_summe: number
          notizen: string | null
          nummer: string
          project_id: string | null
          status: string
          typ: string
          updated_at: string
          user_id: string
          zahlungsbedingungen: string | null
        }
        Insert: {
          brutto_summe?: number
          created_at?: string
          datum?: string
          faellig_am?: string | null
          id?: string
          jahr?: number
          kunde_adresse?: string | null
          kunde_email?: string | null
          kunde_land?: string | null
          kunde_name: string
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_telefon?: string | null
          kunde_uid?: string | null
          laufnummer: number
          leistungsdatum?: string | null
          mwst_betrag?: number
          mwst_satz?: number
          netto_summe?: number
          notizen?: string | null
          nummer: string
          project_id?: string | null
          status?: string
          typ?: string
          updated_at?: string
          user_id: string
          zahlungsbedingungen?: string | null
        }
        Update: {
          brutto_summe?: number
          created_at?: string
          datum?: string
          faellig_am?: string | null
          id?: string
          jahr?: number
          kunde_adresse?: string | null
          kunde_email?: string | null
          kunde_land?: string | null
          kunde_name?: string
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_telefon?: string | null
          kunde_uid?: string | null
          laufnummer?: number
          leistungsdatum?: string | null
          mwst_betrag?: number
          mwst_satz?: number
          netto_summe?: number
          notizen?: string | null
          nummer?: string
          project_id?: string | null
          status?: string
          typ?: string
          updated_at?: string
          user_id?: string
          zahlungsbedingungen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string
          id: string
          total_days: number
          updated_at: string
          used_days: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          end_date: string
          id: string
          notizen: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days?: number
          end_date: string
          id?: string
          notizen?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          notizen?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      material_entries: {
        Row: {
          created_at: string
          id: string
          material: string
          menge: string | null
          notizen: string | null
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material: string
          menge?: string | null
          notizen?: string | null
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material?: string
          menge?: string | null
          notizen?: string | null
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string | null
          einheit: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          einheit?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          einheit?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "project_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_signoffs: {
        Row: {
          created_at: string | null
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          month: number
          signature_data: string | null
          signed_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          month: number
          signature_data?: string | null
          signed_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          month?: number
          signature_data?: string | null
          signed_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      nachkalkulation_positionen: {
        Row: {
          beschreibung: string
          created_at: string | null
          geplante_stunden: number | null
          id: string
          ist_stunden: number | null
          notizen: string | null
          position_nr: string | null
          project_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          beschreibung: string
          created_at?: string | null
          geplante_stunden?: number | null
          id?: string
          ist_stunden?: number | null
          notizen?: string | null
          position_nr?: string | null
          project_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          beschreibung?: string
          created_at?: string | null
          geplante_stunden?: number | null
          id?: string
          ist_stunden?: number | null
          notizen?: string | null
          position_nr?: string | null
          project_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nachkalkulation_positionen_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          comment: string | null
          created_at: string | null
          einheit: string | null
          id: string
          material: string
          menge: string | null
          order_id: string
          sort_order: number | null
          status: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          comment?: string | null
          created_at?: string | null
          einheit?: string | null
          id?: string
          material: string
          menge?: string | null
          order_id: string
          sort_order?: number | null
          status?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          comment?: string | null
          created_at?: string | null
          einheit?: string | null
          id?: string
          material?: string
          menge?: string | null
          order_id?: string
          sort_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          project_id: string
          screenshot_url: string | null
          status: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          project_id: string
          screenshot_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          screenshot_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_metadata: {
        Row: {
          created_at: string | null
          file_path: string | null
          id: string
          release_date: string
          resturlaub: number | null
          stichtag: string | null
          uploaded_by: string | null
          urlaub_einheit: string | null
          urlaubsanspruch: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_path?: string | null
          id?: string
          release_date: string
          resturlaub?: number | null
          stichtag?: string | null
          uploaded_by?: string | null
          urlaub_einheit?: string | null
          urlaubsanspruch?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_path?: string | null
          id?: string
          release_date?: string
          resturlaub?: number | null
          stichtag?: string | null
          uploaded_by?: string | null
          urlaub_einheit?: string | null
          urlaubsanspruch?: number | null
          user_id?: string
        }
        Relationships: []
      }
      payslip_settings: {
        Row: {
          created_at: string | null
          file_path: string
          freigabe_tag: number | null
          id: string
          upload_month: number
          upload_year: number
          uploaded_by: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_path: string
          freigabe_tag?: number | null
          id?: string
          upload_month: number
          upload_year: number
          uploaded_by: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_path?: string
          freigabe_tag?: number | null
          id?: string
          upload_month?: number
          upload_year?: number
          uploaded_by?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_favorites: {
        Row: {
          created_at: string
          document_id: string | null
          file_name: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          file_name?: string | null
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          file_name?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_favorites_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_favorites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anleitung_completed: boolean | null
          created_at: string
          id: string
          is_active: boolean | null
          nachname: string
          updated_at: string
          vorname: string
        }
        Insert: {
          anleitung_completed?: boolean | null
          created_at?: string
          id: string
          is_active?: boolean | null
          nachname: string
          updated_at?: string
          vorname: string
        }
        Update: {
          anleitung_completed?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          nachname?: string
          updated_at?: string
          vorname?: string
        }
        Relationships: []
      }
      project_access: {
        Row: {
          created_at: string | null
          granted_by: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          firma: string | null
          id: string
          name: string
          notizen: string | null
          phase: string | null
          project_id: string
          rolle: string | null
          sort_order: number | null
          telefon: string | null
          weitere_emails: Json
          weitere_telefone: Json
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          firma?: string | null
          id?: string
          name: string
          notizen?: string | null
          phase?: string | null
          project_id: string
          rolle?: string | null
          sort_order?: number | null
          telefon?: string | null
          weitere_emails?: Json
          weitere_telefone?: Json
        }
        Update: {
          created_at?: string | null
          email?: string | null
          firma?: string | null
          id?: string
          name?: string
          notizen?: string | null
          phase?: string | null
          project_id?: string
          rolle?: string | null
          sort_order?: number | null
          telefon?: string | null
          weitere_emails?: Json
          weitere_telefone?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_daily_targets: {
        Row: {
          created_at: string | null
          created_by: string
          datum: string
          id: string
          nachkalkulation_stunden: number | null
          notizen: string | null
          project_id: string
          tagesziel: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          datum: string
          id?: string
          nachkalkulation_stunden?: number | null
          notizen?: string | null
          project_id: string
          tagesziel?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          datum?: string
          id?: string
          nachkalkulation_stunden?: number | null
          notizen?: string | null
          project_id?: string
          tagesziel?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_daily_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_daily_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_day_transport: {
        Row: {
          created_at: string | null
          created_by: string | null
          datum: string
          erforderlich: boolean | null
          id: string
          notiz: string | null
          project_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          datum: string
          erforderlich?: boolean | null
          id?: string
          notiz?: string | null
          project_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          datum?: string
          erforderlich?: boolean | null
          id?: string
          notiz?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_day_transport_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_favorites: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_favorites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_messages: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          message: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          message?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          message?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          adresse: string | null
          anfahrt_ueber_100km: boolean | null
          bauherr: string | null
          bauherr_kontakt: string | null
          bauherr2: string | null
          bauherr2_kontakt: string | null
          bauleiter: string | null
          baustellenart: string | null
          beschreibung: string | null
          besonderheiten: string | null
          budget: number | null
          created_at: string
          end_datum: string | null
          erreichbarkeit: string | null
          hinweise: string | null
          id: string
          kunde_email: string | null
          kunde_telefon: string | null
          name: string
          plz: string | null
          start_datum: string | null
          status: string | null
          updated_at: string
          weitere_adressen: Json
        }
        Insert: {
          adresse?: string | null
          anfahrt_ueber_100km?: boolean | null
          bauherr?: string | null
          bauherr_kontakt?: string | null
          bauherr2?: string | null
          bauherr2_kontakt?: string | null
          bauleiter?: string | null
          baustellenart?: string | null
          beschreibung?: string | null
          besonderheiten?: string | null
          budget?: number | null
          created_at?: string
          end_datum?: string | null
          erreichbarkeit?: string | null
          hinweise?: string | null
          id?: string
          kunde_email?: string | null
          kunde_telefon?: string | null
          name: string
          plz?: string | null
          start_datum?: string | null
          status?: string | null
          updated_at?: string
          weitere_adressen?: Json
        }
        Update: {
          adresse?: string | null
          anfahrt_ueber_100km?: boolean | null
          bauherr?: string | null
          bauherr_kontakt?: string | null
          bauherr2?: string | null
          bauherr2_kontakt?: string | null
          bauleiter?: string | null
          baustellenart?: string | null
          beschreibung?: string | null
          besonderheiten?: string | null
          budget?: number | null
          created_at?: string
          end_datum?: string | null
          erreichbarkeit?: string | null
          hinweise?: string | null
          id?: string
          kunde_email?: string | null
          kunde_telefon?: string | null
          name?: string
          plz?: string | null
          start_datum?: string | null
          status?: string | null
          updated_at?: string
          weitere_adressen?: Json
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          subscription: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          subscription: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_extras: {
        Row: {
          betrag: number | null
          bezeichnung: string
          created_at: string | null
          created_by: string
          id: string
          jahr: number
          monat: number
          user_id: string
        }
        Insert: {
          betrag?: number | null
          bezeichnung: string
          created_at?: string | null
          created_by: string
          id?: string
          jahr: number
          monat: number
          user_id: string
        }
        Update: {
          betrag?: number | null
          bezeichnung?: string
          created_at?: string | null
          created_by?: string
          id?: string
          jahr?: number
          monat?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_extras_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_extras_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          arbeitszeit: number
          beschreibung: string
          created_at: string
          datum: string
          id: string
          project_id: string
          unterschrift_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          arbeitszeit: number
          beschreibung: string
          created_at?: string
          datum: string
          id?: string
          project_id: string
          unterschrift_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          arbeitszeit?: number
          beschreibung?: string
          created_at?: string
          datum?: string
          id?: string
          project_id?: string
          unterschrift_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_blocks: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          label: string | null
          project_id: string | null
          resource_id: string
          sort_order: number | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          label?: string | null
          project_id?: string | null
          resource_id: string
          sort_order?: number | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          label?: string | null
          project_id?: string | null
          resource_id?: string
          sort_order?: number | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_blocks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string | null
          created_by: string | null
          einheit: string | null
          farbe: string | null
          flaeche_m2: number | null
          id: string
          is_active: boolean | null
          kategorie: string
          name: string
          notizen: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          einheit?: string | null
          farbe?: string | null
          flaeche_m2?: number | null
          id?: string
          is_active?: boolean | null
          kategorie?: string
          name: string
          notizen?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          einheit?: string | null
          farbe?: string | null
          flaeche_m2?: number | null
          id?: string
          is_active?: boolean | null
          kategorie?: string
          name?: string
          notizen?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      role_menu_settings: {
        Row: {
          menu_key: string
          role: string
          visible: boolean
        }
        Insert: {
          menu_key: string
          role: string
          visible?: boolean
        }
        Update: {
          menu_key?: string
          role?: string
          visible?: boolean
        }
        Relationships: []
      }
      safety_evaluation_employees: {
        Row: {
          created_at: string | null
          evaluation_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          evaluation_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          evaluation_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_evaluation_employees_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "safety_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_evaluation_signatures: {
        Row: {
          created_at: string | null
          evaluation_id: string
          fragen_antworten: Json | null
          id: string
          inhalte_bestaetigt: boolean | null
          personal_answers: Json | null
          unterschrieben_am: string
          unterschrift: string
          unterschrift_name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          evaluation_id: string
          fragen_antworten?: Json | null
          id?: string
          inhalte_bestaetigt?: boolean | null
          personal_answers?: Json | null
          unterschrieben_am?: string
          unterschrift: string
          unterschrift_name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          evaluation_id?: string
          fragen_antworten?: Json | null
          id?: string
          inhalte_bestaetigt?: boolean | null
          personal_answers?: Json | null
          unterschrieben_am?: string
          unterschrift?: string
          unterschrift_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_evaluation_signatures_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "safety_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_evaluations: {
        Row: {
          checklist_items: Json
          created_at: string | null
          created_by: string
          diskussion_notizen: string | null
          equipment_id: string | null
          excel_file_url: string | null
          filled_answers: Json | null
          fragen: Json | null
          id: string
          inhalt_text: string | null
          ist_vorlage: boolean | null
          jahr: number | null
          kategorie: string | null
          kategorien: string[] | null
          modul: string | null
          pdf_urls: string[] | null
          project_id: string
          status: string
          titel: string
          typ: string
          updated_at: string | null
          video_urls: string[] | null
        }
        Insert: {
          checklist_items?: Json
          created_at?: string | null
          created_by: string
          diskussion_notizen?: string | null
          equipment_id?: string | null
          excel_file_url?: string | null
          filled_answers?: Json | null
          fragen?: Json | null
          id?: string
          inhalt_text?: string | null
          ist_vorlage?: boolean | null
          jahr?: number | null
          kategorie?: string | null
          kategorien?: string[] | null
          modul?: string | null
          pdf_urls?: string[] | null
          project_id: string
          status?: string
          titel: string
          typ: string
          updated_at?: string | null
          video_urls?: string[] | null
        }
        Update: {
          checklist_items?: Json
          created_at?: string | null
          created_by?: string
          diskussion_notizen?: string | null
          equipment_id?: string | null
          excel_file_url?: string | null
          filled_answers?: Json | null
          fragen?: Json | null
          id?: string
          inhalt_text?: string | null
          ist_vorlage?: boolean | null
          jahr?: number | null
          kategorie?: string | null
          kategorien?: string[] | null
          modul?: string | null
          pdf_urls?: string[] | null
          project_id?: string
          status?: string
          titel?: string
          typ?: string
          updated_at?: string | null
          video_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_evaluations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      schulung_zertifikate: {
        Row: {
          created_at: string | null
          created_by: string | null
          gueltig_ab: string
          gueltig_bis: string | null
          id: string
          notizen: string | null
          schulung_id: string | null
          user_id: string
          zertifikat_url: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          notizen?: string | null
          schulung_id?: string | null
          user_id: string
          zertifikat_url?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          notizen?: string | null
          schulung_id?: string | null
          user_id?: string
          zertifikat_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schulung_zertifikate_schulung_id_fkey"
            columns: ["schulung_id"]
            isOneToOne: false
            referencedRelation: "schulungen"
            referencedColumns: ["id"]
          },
        ]
      }
      schulungen: {
        Row: {
          beschreibung: string | null
          created_at: string | null
          created_by: string | null
          id: string
          ist_pflicht: boolean | null
          kategorie: string | null
          name: string
          updated_at: string | null
          wiederholung_monate: number | null
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          ist_pflicht?: boolean | null
          kategorie?: string | null
          name: string
          updated_at?: string | null
          wiederholung_monate?: number | null
        }
        Update: {
          beschreibung?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          ist_pflicht?: boolean | null
          kategorie?: string | null
          name?: string
          updated_at?: string | null
          wiederholung_monate?: number | null
        }
        Relationships: []
      }
      time_account_transactions: {
        Row: {
          balance_after: number
          balance_before: number
          change_type: string
          changed_by: string
          created_at: string
          hours: number
          id: string
          reason: string | null
          reference_id: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          balance_before: number
          change_type: string
          changed_by: string
          created_at?: string
          hours: number
          id?: string
          reason?: string | null
          reference_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          balance_before?: number
          change_type?: string
          changed_by?: string
          created_at?: string
          hours?: number
          id?: string
          reason?: string | null
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      time_accounts: {
        Row: {
          balance_hours: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_hours?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_hours?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          absence_detail: Json | null
          created_at: string
          datum: string
          diaeten_anfahrt: boolean | null
          diaeten_betrag: number | null
          diaeten_typ: string | null
          disturbance_id: string | null
          end_time: string | null
          id: string
          kilometer: number | null
          km_beschreibung: string | null
          location_type: string | null
          lohnstunden: number | null
          notizen: string | null
          pause_end: string | null
          pause_minutes: number
          pause_start: string | null
          project_id: string | null
          start_time: string | null
          stunden: number
          taetigkeit: string | null
          updated_at: string
          user_id: string | null
          week_type: string | null
          zeit_typ: string | null
          zeitausgleich_stunden: number | null
        }
        Insert: {
          absence_detail?: Json | null
          created_at?: string
          datum: string
          diaeten_anfahrt?: boolean | null
          diaeten_betrag?: number | null
          diaeten_typ?: string | null
          disturbance_id?: string | null
          end_time?: string | null
          id?: string
          kilometer?: number | null
          km_beschreibung?: string | null
          location_type?: string | null
          lohnstunden?: number | null
          notizen?: string | null
          pause_end?: string | null
          pause_minutes?: number
          pause_start?: string | null
          project_id?: string | null
          start_time?: string | null
          stunden: number
          taetigkeit?: string | null
          updated_at?: string
          user_id?: string | null
          week_type?: string | null
          zeit_typ?: string | null
          zeitausgleich_stunden?: number | null
        }
        Update: {
          absence_detail?: Json | null
          created_at?: string
          datum?: string
          diaeten_anfahrt?: boolean | null
          diaeten_betrag?: number | null
          diaeten_typ?: string | null
          disturbance_id?: string | null
          end_time?: string | null
          id?: string
          kilometer?: number | null
          km_beschreibung?: string | null
          location_type?: string | null
          lohnstunden?: number | null
          notizen?: string | null
          pause_end?: string | null
          pause_minutes?: number
          pause_start?: string | null
          project_id?: string | null
          start_time?: string | null
          stunden?: number
          taetigkeit?: string | null
          updated_at?: string
          user_id?: string | null
          week_type?: string | null
          zeit_typ?: string | null
          zeitausgleich_stunden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_workers: {
        Row: {
          created_at: string
          id: string
          source_entry_id: string
          target_entry_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_entry_id: string
          target_entry_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_entry_id?: string
          target_entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_workers_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_workers_target_entry_id_fkey"
            columns: ["target_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_overrides: {
        Row: {
          override_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          override_role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          override_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_categories: {
        Row: {
          created_at: string | null
          id: string
          label: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      warehouse_delivery_note_items: {
        Row: {
          created_at: string | null
          delivery_note_id: string
          id: string
          menge: number
          product_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_note_id: string
          id?: string
          menge: number
          product_id: string
        }
        Update: {
          created_at?: string | null
          delivery_note_id?: string
          id?: string
          menge?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "warehouse_delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "warehouse_products"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_delivery_notes: {
        Row: {
          created_at: string | null
          datum: string
          id: string
          incoming_document_id: string | null
          kunde_verrechnet: boolean | null
          notizen: string | null
          parent_note_id: string | null
          photo_urls: string[]
          source_project_id: string | null
          target_project_id: string | null
          transfer_type: string
          unterschrift: string
          unterschrift_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          datum?: string
          id?: string
          incoming_document_id?: string | null
          kunde_verrechnet?: boolean | null
          notizen?: string | null
          parent_note_id?: string | null
          photo_urls?: string[]
          source_project_id?: string | null
          target_project_id?: string | null
          transfer_type: string
          unterschrift: string
          unterschrift_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          datum?: string
          id?: string
          incoming_document_id?: string | null
          kunde_verrechnet?: boolean | null
          notizen?: string | null
          parent_note_id?: string | null
          photo_urls?: string[]
          source_project_id?: string | null
          target_project_id?: string | null
          transfer_type?: string
          unterschrift?: string
          unterschrift_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_delivery_notes_incoming_document_id_fkey"
            columns: ["incoming_document_id"]
            isOneToOne: false
            referencedRelation: "incoming_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_notes_parent_note_id_fkey"
            columns: ["parent_note_id"]
            isOneToOne: false
            referencedRelation: "warehouse_delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_notes_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_notes_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_products: {
        Row: {
          aufschlag_prozent: number | null
          category: string
          created_at: string | null
          current_stock: number
          einheit: string
          ek_preis: number | null
          id: string
          is_active: boolean
          lieferant: string | null
          lieferdatum: string | null
          name: string
          rechnungsdatum: string | null
          updated_at: string | null
        }
        Insert: {
          aufschlag_prozent?: number | null
          category: string
          created_at?: string | null
          current_stock?: number
          einheit?: string
          ek_preis?: number | null
          id?: string
          is_active?: boolean
          lieferant?: string | null
          lieferdatum?: string | null
          name: string
          rechnungsdatum?: string | null
          updated_at?: string | null
        }
        Update: {
          aufschlag_prozent?: number | null
          category?: string
          created_at?: string | null
          current_stock?: number
          einheit?: string
          ek_preis?: number | null
          id?: string
          is_active?: boolean
          lieferant?: string | null
          lieferdatum?: string | null
          name?: string
          rechnungsdatum?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      warehouse_stock_transactions: {
        Row: {
          created_at: string | null
          delivery_note_id: string
          id: string
          menge: number
          product_id: string
          project_id: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_note_id: string
          id?: string
          menge: number
          product_id: string
          project_id?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_note_id?: string
          id?: string
          menge?: number
          product_id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_transactions_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "warehouse_delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "warehouse_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      week_settings: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          week_start: string
          week_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          week_start: string
          week_type: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          week_start?: string
          week_type?: string
        }
        Relationships: []
      }
      worker_assignments: {
        Row: {
          created_at: string | null
          created_by: string
          datum: string
          id: string
          notizen: string | null
          project_id: string
          transport_erforderlich: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          datum: string
          id?: string
          notizen?: string | null
          project_id: string
          transport_erforderlich?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          datum?: string
          id?: string
          notizen?: string | null
          project_id?: string
          transport_erforderlich?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_goals: {
        Row: {
          created_at: string | null
          created_by: string | null
          datum: string | null
          id: string
          scope: string
          updated_at: string | null
          user_id: string
          week_start: string | null
          ziel: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          datum?: string | null
          id?: string
          scope: string
          updated_at?: string | null
          user_id: string
          week_start?: string | null
          ziel: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          datum?: string | null
          id?: string
          scope?: string
          updated_at?: string | null
          user_id?: string
          week_start?: string | null
          ziel?: string
        }
        Relationships: []
      }
      yearly_plan_blocks: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string
          end_week: number
          id: string
          individual_name: string | null
          partie: string | null
          project_id: string | null
          sort_order: number | null
          start_week: number
          title: string
          updated_at: string | null
          year: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by: string
          end_week: number
          id?: string
          individual_name?: string | null
          partie?: string | null
          project_id?: string | null
          sort_order?: number | null
          start_week: number
          title: string
          updated_at?: string | null
          year: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string
          end_week?: number
          id?: string
          individual_name?: string | null
          partie?: string | null
          project_id?: string | null
          sort_order?: number | null
          start_week?: number
          title?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "yearly_plan_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_user_profile: { Args: never; Returns: Json }
      fn_user_created_evaluation: {
        Args: { eval_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_invoice_number: {
        Args: { p_jahr?: number; p_typ: string }
        Returns: string
      }
      notify_admins_sick_note: {
        Args: {
          p_file_name: string
          p_uploader_id: string
          p_uploader_name: string
        }
        Returns: undefined
      }
      transfer_equipment: {
        Args: {
          p_equipment_id: string
          p_nach_project_id?: string
          p_nach_typ: string
          p_notizen?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "administrator" | "mitarbeiter"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrator", "mitarbeiter"],
    },
  },
} as const

