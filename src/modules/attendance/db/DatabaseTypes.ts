import type { ColumnType } from "kysely";
import type { Campus, GroupServiceTime, Headcount, LabelTemplate, Service, ServiceTime, Session, Visit, VisitSession } from "../models/index.js";

interface SoftDelete {
  removed?: boolean;
}

// Repositories write DATE/DATETIME columns as MySQL date strings (DateHelper.toMysqlDate*); reads still return Date.
type MysqlDates<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: ColumnType<T[P], T[P] | string | null, T[P] | string | null>;
};

export interface AttendanceDatabase {
  campuses: Campus & SoftDelete;
  groupServiceTimes: Omit<GroupServiceTime, "serviceTime">;
  headcounts: MysqlDates<Omit<Headcount, "serviceName" | "serviceTimeName">, "headcountDate">;
  labelTemplates: MysqlDates<LabelTemplate, "createdDate" | "modifiedDate">;
  services: Omit<Service, "campus"> & SoftDelete;
  serviceTimes: Omit<ServiceTime, "longName" | "checkinOpen"> & SoftDelete;
  sessions: MysqlDates<Omit<Session, "displayName" | "visitCount">, "sessionDate">;
  visits: MysqlDates<Omit<Visit, "visitSessions">, "visitDate" | "checkinTime" | "checkoutTime">;
  visitSessions: Omit<VisitSession, "visit" | "session">;
}
