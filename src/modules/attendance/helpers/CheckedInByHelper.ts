import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

interface CheckedInByTarget {
  checkedInById?: string;
  checkedInBy?: string;
}

// checkedInById points at a membership person; names come from there since the attendance tables don't hold them.
export class CheckedInByHelper {
  // Clears any checkedInById that isn't a current person in this church, so a client can't attribute a check-in to an outsider.
  static async keepChurchPeopleOnly(churchId: string, visits: CheckedInByTarget[]) {
    const ids = [...new Set(visits.map((v) => v.checkedInById).filter(Boolean))];
    if (ids.length === 0) return;
    const found = new Set((await getMembershipModuleGateway().loadPeople(churchId, ids)).map((p) => p.id));
    visits.forEach((v) => { if (v.checkedInById && !found.has(v.checkedInById)) v.checkedInById = undefined; });
  }

  // Fills checkedInBy with the display name of each target's checkedInById ("" when unknown or removed).
  static async attachNames(churchId: string, targets: CheckedInByTarget[]) {
    const withId = targets.filter((t) => t?.checkedInById);
    if (withId.length === 0) return;
    const people = await getMembershipModuleGateway().loadPeople(churchId, [...new Set(withId.map((t) => t.checkedInById))]);
    const names = new Map(people.map((p) => [p.id, p.displayName || ""]));
    withId.forEach((t) => { t.checkedInBy = names.get(t.checkedInById) || ""; });
  }
}
