import { Report } from "../models/index.js";

// Columns the groupAttendanceDownload report's queries select.
type AttendanceRow = { groupId: string; personId: string; serviceTimeId: string; sessionDate: string; serviceName?: string; serviceTimeName?: string };
type GroupRow = { id: string; groupName: string };
type GroupMemberRow = { groupId: string; personId: string };
type PersonRow = { id: string; displayName: string; firstName?: string; lastName?: string };

export class GroupAttendanceDownloadHelper {
  // One row per group member, one present/absent column per dated session.
  public static combine(report: Report) {
    const result: Record<string, string>[] = [];
    const personByRow = new Map<Record<string, string>, PersonRow>();
    const getValue = (keyName: string) => report.queries?.find((q) => q.keyName === keyName)?.value;
    const attendance = getValue("main") as AttendanceRow[];
    const groups = getValue("groups") as GroupRow[];
    const groupMembers = getValue("groupMembers") as GroupMemberRow[];
    const people = getValue("people") as PersonRow[];

    if (!attendance || !groups || !groupMembers || !people) return result;

    // Sessions in query order (date, service, service time)
    const sessions: { name: string; serviceTimeId: string; sessionDate: string }[] = [];
    const seen = new Set<string>();
    attendance.forEach((a) => {
      const key = a.serviceTimeId + "//" + a.sessionDate;
      if (seen.has(key)) return;
      seen.add(key);
      // Sessions of groups with no service time are labeled by date alone.
      const service = [a.serviceName, a.serviceTimeName].filter(Boolean).join(" - ");
      sessions.push({ name: service ? `${service} (${a.sessionDate})` : a.sessionDate, serviceTimeId: a.serviceTimeId, sessionDate: a.sessionDate });
    });

    const present = new Set<string>(attendance.map((a) => [a.groupId, a.personId, a.serviceTimeId, a.sessionDate].join("//")));

    groups.forEach((g) => {
      groupMembers.filter((gm) => gm.groupId === g.id).forEach((gm) => {
        const person = people.find((p) => p.id === gm.personId);
        if (!person) return;
        const row: Record<string, string> = { displayName: person.displayName, groupName: g.groupName };
        sessions.forEach((s) => {
          row[s.name] = present.has([g.id, person.id, s.serviceTimeId, s.sessionDate].join("//")) ? "present" : "absent";
        });
        row.personId = person.id;
        row.groupId = g.id;
        result.push(row);
        personByRow.set(row, person);
      });
    });

    result.sort((a, b) => (a.groupName || "").localeCompare(b.groupName || "") || (personByRow.get(a).lastName || "").localeCompare(personByRow.get(b).lastName || "") || (personByRow.get(a).firstName || "").localeCompare(personByRow.get(b).firstName || ""));
    return result;
  }
}
