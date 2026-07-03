import { DateHelper } from "./DateHelper.js";

// Civil-local date helpers for the reminder engine. "Civil" = the wall-clock
// fields of a Date as constructed (RecurrenceHelper's fake-UTC convention),
// read via local getters — never a real-tz instant. Shared so the adapters and
// the content gateway agree on one definition of the occurrenceKey date.
const pad = (n: number) => String(n).padStart(2, "0");

export const civilDate = (d: Date): string => DateHelper.toMysqlDateOnly(d)!;
export const civilISO = (d: Date): string => `${civilDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export interface CivilOccurrence {
  startLocalDate: string;
  startLocalISO: string;
}

export const singleDateOccurrence = (raw: Date | string | null | undefined, from: Date, to: Date): CivilOccurrence[] => {
  if (!raw) return [];
  const d = new Date(raw);
  if (d.getTime() < from.getTime() || d.getTime() > to.getTime()) return [];
  return [{ startLocalDate: civilDate(d), startLocalISO: civilISO(d) }];
};
