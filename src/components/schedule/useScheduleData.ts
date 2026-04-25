import { useState, useCallback } from "react";
import { format, startOfYear, endOfYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type {
  Profile,
  Project,
  Assignment,
  Resource,
  MasterResource,
  DailyTarget,
  LeaveRequest,
  CompanyHoliday,
  ScheduleMode,
} from "./scheduleTypes";

export function useScheduleData() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [masterResources, setMasterResources] = useState<MasterResource[]>([]);
  const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    async (weekStart: Date, weekEnd: Date, mode: ScheduleMode) => {
      setLoading(true);

      let fromDate: string;
      let toDate: string;

      if (mode === "year") {
        const yearStart = startOfYear(weekStart);
        const yearEnd = endOfYear(weekStart);
        fromDate = format(yearStart, "yyyy-MM-dd");
        toDate = format(yearEnd, "yyyy-MM-dd");
      } else {
        fromDate = format(weekStart, "yyyy-MM-dd");
        toDate = format(weekEnd, "yyyy-MM-dd");
      }

      const [
        { data: profs },
        { data: projs },
        { data: assigns },
        { data: res },
        { data: masterRes },
        { data: targets },
        { data: leave },
        { data: holidays },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, vorname, nachname")
          .eq("is_active", true)
          .order("nachname"),
        supabase
          .from("projects")
          .select("id, name")
          .eq("status", "aktiv")
          .order("name"),
        supabase
          .from("worker_assignments")
          .select("id, user_id, project_id, datum, notizen, transport_erforderlich")
          .gte("datum", fromDate)
          .lte("datum", toDate),
        supabase
          .from("assignment_resources")
          .select("id, project_id, datum, resource_name, menge, einheit")
          .gte("datum", fromDate)
          .lte("datum", toDate),
        // Master-Ressourcen-Liste mit Farbe — auch in Wochen-Plantafel verwendet
        (supabase.from("resources") as any)
          .select("id, name, kategorie, einheit, farbe, is_active")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("project_daily_targets")
          .select(
            "id, project_id, datum, tagesziel, nachkalkulation_stunden, notizen"
          )
          .gte("datum", fromDate)
          .lte("datum", toDate),
        supabase
          .from("leave_requests")
          .select("id, user_id, start_date, end_date, type, status, days")
          .eq("status", "genehmigt")
          .lte("start_date", toDate)
          .gte("end_date", fromDate),
        supabase.from("company_holidays").select("id, datum, bezeichnung"),
      ]);

      if (profs) setProfiles(profs);
      if (projs) setProjects(projs);
      if (assigns) setAssignments(assigns as Assignment[]);
      if (res) setResources(res as Resource[]);
      if (masterRes) setMasterResources(masterRes as MasterResource[]);
      if (targets) setDailyTargets(targets as DailyTarget[]);
      if (leave) setLeaveRequests(leave as LeaveRequest[]);
      if (holidays) setCompanyHolidays(holidays as CompanyHoliday[]);

      setLoading(false);
    },
    []
  );

  return {
    profiles,
    projects,
    assignments,
    setAssignments,
    resources,
    setResources,
    masterResources,
    setMasterResources,
    dailyTargets,
    setDailyTargets,
    leaveRequests,
    companyHolidays,
    setCompanyHolidays,
    loading,
    fetchData,
  };
}
