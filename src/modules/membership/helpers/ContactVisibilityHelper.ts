import { Permissions } from "./index.js";
import type { Person } from "../models/index.js";
import type { Repos } from "../repositories/index.js";

// Church-wide default (settings.addressVisibility / phoneVisibility / emailVisibility) or a
// person's own override (visibilityPreferences). Each level is strictly narrower than the last.
export const CONTACT_VISIBILITY_LEVELS = ["everyone", "members", "groups", "leaders", "staff"] as const;
export type ContactVisibilityLevel = (typeof CONTACT_VISIBILITY_LEVELS)[number];

export interface ContactVisibilityViewer {
  isSelf: boolean;
  isMember: boolean; // viewer's membershipStatus is Member or Staff
  sharesGroup: boolean; // viewer belongs to at least one group the target belongs to
  leadsGroup: boolean; // viewer leads at least one group the target belongs to
}

interface ViewerAu {
  churchId: string;
  personId?: string;
  membershipStatus?: string;
  groupIds?: string[];
  leaderGroupIds?: string[];
  checkAccess: (perm: any) => boolean;
}

const ADDRESS_FIELDS = ["address1", "address2", "city", "state", "zip"] as const;
const PHONE_FIELDS = ["mobilePhone", "homePhone", "workPhone"] as const;
const EMAIL_FIELDS = ["email"] as const;

// Single implementation of the per-field contact visibility rules, batched so list endpoints
// cost three queries (church defaults, person prefs, target group memberships) regardless of size.
export class ContactVisibilityHelper {
  public static normalizeLevel(value: any): ContactVisibilityLevel {
    return (CONTACT_VISIBILITY_LEVELS as readonly string[]).includes(value) ? (value as ContactVisibilityLevel) : "members";
  }

  public static canSee(level: ContactVisibilityLevel, viewer: ContactVisibilityViewer): boolean {
    if (viewer.isSelf) return true;
    switch (level) {
      case "everyone": return true;
      case "members": return viewer.isMember;
      case "groups": return viewer.sharesGroup;
      case "leaders": return viewer.leadsGroup;
      case "staff": return false;
      default: return false;
    }
  }

  public static isMember(membershipStatus?: string): boolean {
    return membershipStatus === "Member" || membershipStatus === "Staff";
  }

  public static async redact(au: ViewerAu, person: Person, repos: Repos): Promise<Person> {
    if (!person) return person;
    const result = await this.redactAll(au, [person], repos);
    return result[0];
  }

  // Returns new Person objects with contact fields the viewer may not see set to undefined.
  // Staff with people.view see everything; everyone always sees their own record.
  public static async redactAll(au: ViewerAu, people: Person[], repos: Repos): Promise<Person[]> {
    if (!Array.isArray(people) || people.length === 0) return people;
    if (au.checkAccess(Permissions.people.view)) return people;

    const ids = people.map((p) => p?.id).filter((id) => !!id);
    const defaults = await this.loadChurchDefaults(au.churchId, repos);
    const prefsByPerson = await this.loadPersonPrefs(au.churchId, ids, repos);

    const levelsByPerson = new Map<string, { address: ContactVisibilityLevel; phone: ContactVisibilityLevel; email: ContactVisibilityLevel }>();
    let needsGroups = false;
    people.forEach((p) => {
      if (!p?.id) return;
      const pref = prefsByPerson.get(p.id);
      const levels = {
        address: this.normalizeLevel(pref?.address || defaults.address),
        phone: this.normalizeLevel(pref?.phoneNumber || defaults.phone),
        email: this.normalizeLevel(pref?.email || defaults.email)
      };
      levelsByPerson.set(p.id, levels);
      if ([levels.address, levels.phone, levels.email].some((l) => l === "groups" || l === "leaders")) needsGroups = true;
    });

    const groupsByPerson = needsGroups ? await this.loadTargetGroups(au.churchId, ids, repos) : new Map<string, string[]>();
    const viewerGroups = new Set(au.groupIds || []);
    const viewerLeads = new Set(au.leaderGroupIds || []);
    const isMember = this.isMember(au.membershipStatus);

    return people.map((p) => {
      if (!p?.id) return p;
      const levels = levelsByPerson.get(p.id);
      const targetGroups = groupsByPerson.get(p.id) || [];
      const viewer: ContactVisibilityViewer = {
        isSelf: !!au.personId && au.personId === p.id,
        isMember,
        sharesGroup: targetGroups.some((g) => viewerGroups.has(g)),
        leadsGroup: targetGroups.some((g) => viewerLeads.has(g))
      };
      const contactInfo: any = { ...(p.contactInfo || {}) };
      if (!this.canSee(levels.address, viewer)) ADDRESS_FIELDS.forEach((f) => { contactInfo[f] = undefined; });
      if (!this.canSee(levels.phone, viewer)) PHONE_FIELDS.forEach((f) => { contactInfo[f] = undefined; });
      if (!this.canSee(levels.email, viewer)) EMAIL_FIELDS.forEach((f) => { contactInfo[f] = undefined; });
      return { ...p, contactInfo };
    });
  }

  private static async loadChurchDefaults(churchId: string, repos: Repos) {
    const rows = repos.setting.convertAllToModel(churchId, (await repos.setting.loadPublicSettings(churchId)) as any[]);
    const settings: any = {};
    rows?.forEach((s: any) => { settings[s.keyName] = s.value; });
    return {
      address: settings.addressVisibility || "members",
      phone: settings.phoneVisibility || "members",
      email: settings.emailVisibility || "members"
    };
  }

  private static async loadPersonPrefs(churchId: string, personIds: string[], repos: Repos) {
    const result = new Map<string, { address?: string; phoneNumber?: string; email?: string }>();
    if (personIds.length === 0) return result;
    const rows = (await repos.visibilityPreference.loadForPeople(churchId, personIds)) as any[];
    rows?.forEach((r) => { if (r?.personId) result.set(r.personId, r); });
    return result;
  }

  private static async loadTargetGroups(churchId: string, personIds: string[], repos: Repos) {
    const result = new Map<string, string[]>();
    if (personIds.length === 0) return result;
    const rows = (await repos.groupMember.loadForPeople(personIds)) as any[];
    rows?.forEach((r) => {
      if (r.churchId && r.churchId !== churchId) return;
      if (!result.has(r.personId)) result.set(r.personId, []);
      result.get(r.personId).push(r.groupId);
    });
    return result;
  }
}
