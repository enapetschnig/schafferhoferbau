export type Profile = { id: string; vorname: string; nachname: string };
export type Project = { id: string; name: string };

export type Assignment = {
  id: string;
  user_id: string;
  project_id: string;
  datum: string;
  notizen: string | null;
  transport_erforderlich?: boolean | null;
};

export type Resource = {
  id: string;
  project_id: string;
  datum: string;
  resource_name: string;
  menge: number | null;
  einheit: string | null;
};

export type DailyTarget = {
  id: string;
  project_id: string;
  datum: string;
  tagesziel: string | null;
  nachkalkulation_stunden: number | null;
  notizen: string | null;
};

export type LeaveRequest = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  days: number;
};

export type CompanyHoliday = {
  id: string;
  datum: string;
  bezeichnung: string | null;
};

export type ScheduleMode = "week" | "year";
