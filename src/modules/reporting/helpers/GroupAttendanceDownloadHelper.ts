import { Report } from "../models/index.js";

export class GroupAttendanceDownloadHelper {
  // One row per group member, one present/absent column per dated session.
  public static combine(report: Report) {
    const result: any[] = [];
    const getValue = (keyName: string) => report.queries?.find((q) => q.keyName === keyName)?.value;
    const attendance: any[] = getValue("main");
    const groups: any[] = getValue("groups");
    const groupMembers: any[] = getValue("groupMembers");
    const people: any[] = getValue("people");

    if (!attendance || !groups || !groupMembers || !people) return result;

    // Sessions in query order (date, service, service time)
    const sessions: { name: string; serviceTimeId: string; sessionDate: string }[] = [];
    const seen = new Set<string>();
    attendance.forEach((a) => {
      const key = a.serviceTimeId + "//" + a.sessionDate;
      if (seen.has(key)) return;
      seen.add(key);
      sessions.push({ name: `${a.serviceName} - ${a.serviceTimeName} (${a.sessionDate})`, serviceTimeId: a.serviceTimeId, sessionDate: a.sessionDate });
    });

    const present = new Set<string>(attendance.map((a) => [a.groupId, a.personId, a.serviceTimeId, a.sessionDate].join("//")));

    groups.forEach((g) => {
      groupMembers.filter((gm) => gm.groupId === g.id).forEach((gm) => {
        const person = people.find((p) => p.id === gm.personId);
        if (!person) return;
        const row: any = { displayName: person.displayName, groupName: g.groupName };
        sessions.forEach((s) => {
          row[s.name] = present.has([g.id, person.id, s.serviceTimeId, s.sessionDate].join("//")) ? "present" : "absent";
        });
        row.personId = person.id;
        row.groupId = g.id;
        result.push(row);
      });
    });

    result.sort((a, b) => (a.groupName || "").localeCompare(b.groupName || "") || (a.displayName || "").localeCompare(b.displayName || ""));
    return result;
  }
}
