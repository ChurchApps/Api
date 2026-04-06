import type { Campus, GroupServiceTime, Service, ServiceTime, Session, Visit, VisitSession } from "../models/index.js";

interface SoftDelete {
  removed?: boolean;
}

export interface AttendanceDatabase {
  campuses: Campus & SoftDelete;
  groupServiceTimes: Omit<GroupServiceTime, "serviceTime">;
  services: Omit<Service, "campus"> & SoftDelete;
  serviceTimes: Omit<ServiceTime, "longName"> & SoftDelete;
  sessions: Omit<Session, "displayName">;
  visits: Omit<Visit, "visitSessions">;
  visitSessions: Omit<VisitSession, "visit" | "session">;
}
