import { sql } from "kysely";
import { RepoManager } from "../infrastructure/RepoManager.js";
import { KyselyPool } from "../infrastructure/KyselyPool.js";

// Gateway contract; Db impl is swappable for HTTP if ever separate service.

interface ConditionInput {
  churchId: string;
  field: string;
  operator: string;
  value?: string;
  fieldData?: string;
}

interface GuestInfo {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface MembershipModuleGateway {
  loadIdsMatchingCondition(condition: ConditionInput): Promise<string[]>;
  loadPeople(churchId: string, personIds: string[]): Promise<{ id: string; displayName: string }[]>;
  loadGroupMembersForPerson(churchId: string, personId: string): Promise<{ groupId: string }[]>;
  loadGroupMemberPersonIds(churchId: string, groupId: string): Promise<string[]>;
  loadGroupLeaderPersonIds(churchId: string, groupId: string): Promise<string[]>;
  loadHouseholdPeople(churchId: string, personIds: string[]): Promise<{ id: string; householdId: string }[]>;
  loadChurch(churchId: string): Promise<{ id: string; name: string; subDomain: string; timeZone?: string } | null>;
  loadGroup(churchId: string, groupId: string): Promise<{ id: string; name: string; categoryName?: string } | null>;
  searchPersonByEmail(churchId: string, email: string): Promise<{ id: string; householdId: string; email: string }[]>;
  loadPerson(churchId: string, personId: string): Promise<{ id: string; householdId: string; email: string; membershipStatus?: string; gender?: string; maritalStatus?: string; birthDate?: Date } | null>;
  getOrCreateGuestPerson(churchId: string, guestInfo: GuestInfo): Promise<{ personId: string; householdId: string; email: string }>;
  // Idempotent: adds the person to the group only if not already a member.
  addGroupMember(churchId: string, groupId: string, personId: string): Promise<void>;
  // Idempotent: removes the person's membership row(s) for the group.
  removeGroupMember(churchId: string, groupId: string, personId: string): Promise<void>;
  setPersonField(churchId: string, personId: string, field: string, value: string): Promise<void>;
  loadPeopleForAutomation(churchId: string): Promise<{ id: string; displayName: string; membershipStatus?: string; gender?: string; maritalStatus?: string }[]>;
  loadList(churchId: string, listId: string): Promise<{ id: string; name: string } | null>;
  loadListMemberPersonIds(churchId: string, listId: string): Promise<string[]>;
  loadSetting(churchId: string, keyName: string): Promise<string | null>;
  loadGroupsForCheckin(churchId: string, groupIds: string[]): Promise<CheckinGroup[]>;
  loadHouseholdAdults(churchId: string, personIds: string[]): Promise<HouseholdAdult[]>;
}

export interface CheckinGroup {
  id: string;
  name: string;
  capacity?: number;
  guestCapacity?: number;
  checkinClosed: boolean;
  volunteerRatio?: number;
  minVolunteers?: number;
}

export interface HouseholdAdult {
  personId: string;
  name: string;
  mobilePhone: string;
  optedOut: boolean;
}

class MembershipModuleGatewayDb implements MembershipModuleGateway {
  private static readonly ALLOWED_FIELDS = new Set([
    "firstName",
    "lastName",
    "middleName",
    "nickName",
    "displayName",
    "email",
    "homePhone",
    "workPhone",
    "mobilePhone",
    "birthDate",
    "anniversary",
    "membershipStatus",
    "gender",
    "city",
    "state",
    "zip",
    "maritalStatus"
  ]);
  private static readonly ALLOWED_OPERATORS = new Set(["=", "!=", ">", "<", ">=", "<=", "LIKE"]);

  private getDb() {
    return KyselyPool.getDb("membership") as any;
  }

  private async repos() {
    return RepoManager.getRepos<any>("membership");
  }

  private getDBField(condition: ConditionInput) {
    if (!MembershipModuleGatewayDb.ALLOWED_FIELDS.has(condition.field)) {
      throw new Error(`Invalid condition field: ${condition.field}`);
    }
    const fieldData = condition.fieldData ? JSON.parse(condition.fieldData) : {};
    let result = condition.field;
    switch (fieldData.datePart) {
      case "dayOfWeek": result = "dayOfWeek(" + condition.field + ")"; break;
      case "dayOfMonth": result = "dayOfMonth(" + condition.field + ")"; break;
      case "month": result = "month(" + condition.field + ")"; break;
      case "years": result = "TIMESTAMPDIFF(YEAR, " + condition.field + ", CURDATE())"; break;
    }
    return result;
  }

  private getDBValue(condition: ConditionInput) {
    let result = condition.value;
    switch (condition.value) {
      case "{currentMonth}": result = (new Date().getMonth() + 1).toString(); break;
      case "{prevMonth}":
        result = new Date().getMonth().toString();
        if (result === "0") result = "12";
        break;
      case "{nextMonth}":
        result = (new Date().getMonth() + 2).toString();
        if (result === "13") result = "1";
        break;
    }
    return result;
  }

  public async loadIdsMatchingCondition(condition: ConditionInput): Promise<string[]> {
    if (!MembershipModuleGatewayDb.ALLOWED_OPERATORS.has(condition.operator)) {
      throw new Error(`Invalid condition operator: ${condition.operator}`);
    }
    const dbField = this.getDBField(condition);
    const dbValue = this.getDBValue(condition);

    const rows = (await this.getDb().selectFrom("people")
      .select("id")
      .where("churchId", "=", condition.churchId)
      .where("removed", "=", 0)
      .where(sql`${sql.raw(dbField)} ${sql.raw(condition.operator)} ${dbValue}`)
      .execute()) as { id: string }[];

    return rows.map((r) => r.id);
  }

  public async loadPeople(churchId: string, personIds: string[]): Promise<{ id: string; displayName: string }[]> {
    if (personIds.length === 0) return [];
    return this.getDb().selectFrom("people")
      .select(["id", "displayName"])
      .where("churchId", "=", churchId)
      .where("removed", "=", 0)
      .where("id", "in", personIds)
      .execute();
  }

  public async loadGroupMembersForPerson(churchId: string, personId: string): Promise<{ groupId: string }[]> {
    const repos = await this.repos();
    const members = await repos.groupMember.loadForPerson(churchId, personId);
    return Array.isArray(members) ? members : [];
  }

  public async loadGroupMemberPersonIds(churchId: string, groupId: string): Promise<string[]> {
    const rows = (await this.getDb().selectFrom("groupMembers")
      .select("personId")
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId)
      .execute()) as { personId: string }[];
    return rows.map((r) => r.personId).filter((id) => !!id);
  }

  public async loadGroupLeaderPersonIds(churchId: string, groupId: string): Promise<string[]> {
    const rows = (await this.getDb().selectFrom("groupMembers")
      .select("personId")
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId)
      .where("leader", "=", 1)
      .execute()) as { personId: string }[];
    return rows.map((r) => r.personId).filter((id) => !!id);
  }

  public async loadHouseholdPeople(churchId: string, personIds: string[]): Promise<{ id: string; householdId: string }[]> {
    if (personIds.length === 0) return [];
    const seeds = (await this.getDb().selectFrom("people")
      .select(["id", "householdId"])
      .where("churchId", "=", churchId)
      .where("removed", "=", 0)
      .where("id", "in", personIds)
      .execute()) as { id: string; householdId: string }[];
    const householdIds = [...new Set(seeds.map((p) => p.householdId).filter((id) => !!id))];
    if (householdIds.length === 0) return seeds;
    return this.getDb().selectFrom("people")
      .select(["id", "householdId"])
      .where("churchId", "=", churchId)
      .where("removed", "=", 0)
      .where("householdId", "in", householdIds)
      .execute();
  }

  public async loadChurch(churchId: string) {
    const repos = await this.repos();
    return (await repos.church.loadById(churchId)) ?? null;
  }

  public async loadGroup(churchId: string, groupId: string) {
    const repos = await this.repos();
    return (await repos.group.load(churchId, groupId)) ?? null;
  }

  public async searchPersonByEmail(churchId: string, email: string) {
    const repos = await this.repos();
    return (await repos.person.searchEmail(churchId, email)) ?? [];
  }

  public async loadPerson(churchId: string, personId: string) {
    const repos = await this.repos();
    return (await repos.person.load(churchId, personId)) ?? null;
  }

  public async getOrCreateGuestPerson(churchId: string, guestInfo: GuestInfo) {
    const repos = await this.repos();
    const existing = await repos.person.searchEmail(churchId, guestInfo.email);
    if (existing && existing.length > 0) {
      return { personId: existing[0].id, householdId: existing[0].householdId, email: existing[0].email };
    }
    const household = await repos.household.save({ churchId, name: guestInfo.lastName });
    // PersonRepo.save maps only the nested name/contactInfo shapes to columns.
    const person = await repos.person.save({
      churchId,
      name: { first: guestInfo.firstName, last: guestInfo.lastName },
      contactInfo: { email: guestInfo.email, mobilePhone: guestInfo.phone || null },
      householdId: household.id,
      householdRole: "Head",
      membershipStatus: "Guest"
    } as any);
    return { personId: person.id, householdId: household.id, email: guestInfo.email };
  }

  public async addGroupMember(churchId: string, groupId: string, personId: string): Promise<void> {
    const repos = await this.repos();
    const existing = await repos.groupMember.loadForPerson(churchId, personId);
    if (Array.isArray(existing) && existing.some((m: any) => m.groupId === groupId)) return;
    await repos.groupMember.save({ churchId, groupId, personId, leader: false });
    await repos.groupMemberHistory.log(churchId, groupId, personId, "joined");
  }

  public async removeGroupMember(churchId: string, groupId: string, personId: string): Promise<void> {
    const result = await this.getDb().deleteFrom("groupMembers")
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId)
      .where("personId", "=", personId)
      .execute();
    const deleted = Number(result?.[0]?.numDeletedRows ?? 0);
    if (deleted > 0) await (await this.repos()).groupMemberHistory.log(churchId, groupId, personId, "left");
  }

  public async loadPeopleForAutomation(churchId: string) {
    return this.getDb().selectFrom("people")
      .select(["id", "displayName", "membershipStatus", "gender", "maritalStatus"])
      .where("churchId", "=", churchId)
      .where("removed", "=", 0)
      .execute();
  }

  public async loadList(churchId: string, listId: string) {
    const row = await this.getDb().selectFrom("lists")
      .select(["id", "name"])
      .where("churchId", "=", churchId)
      .where("id", "=", listId)
      .executeTakeFirst();
    return row ?? null;
  }

  public async loadListMemberPersonIds(churchId: string, listId: string): Promise<string[]> {
    const rows = (await this.getDb().selectFrom("listMembers")
      .select("personId")
      .where("churchId", "=", churchId)
      .where("listId", "=", listId)
      .execute()) as { personId: string }[];
    return rows.map((r) => r.personId).filter((id) => !!id);
  }

  public async loadSetting(churchId: string, keyName: string): Promise<string | null> {
    const row = await this.getDb().selectFrom("settings")
      .select("value")
      .where("churchId", "=", churchId)
      .where("keyName", "=", keyName)
      .executeTakeFirst();
    return (row?.value as string) ?? null;
  }

  public async loadGroupsForCheckin(churchId: string, groupIds: string[]): Promise<CheckinGroup[]> {
    if (groupIds.length === 0) return [];
    const rows = (await this.getDb().selectFrom("groups")
      .select(["id", "name", "capacity", "guestCapacity", "checkinClosed", "volunteerRatio", "minVolunteers"])
      .where("churchId", "=", churchId)
      .where("id", "in", groupIds)
      .execute()) as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity ?? undefined,
      guestCapacity: r.guestCapacity ?? undefined,
      checkinClosed: r.checkinClosed === 1 || r.checkinClosed === true,
      volunteerRatio: r.volunteerRatio ?? undefined,
      minVolunteers: r.minVolunteers ?? undefined
    }));
  }

  public async loadHouseholdAdults(churchId: string, personIds: string[]): Promise<HouseholdAdult[]> {
    if (personIds.length === 0) return [];
    const seeds = (await this.getDb().selectFrom("people")
      .select("householdId")
      .where("churchId", "=", churchId)
      .where("removed", "=", 0)
      .where("id", "in", personIds)
      .execute()) as { householdId: string }[];
    const householdIds = [...new Set(seeds.map((p) => p.householdId).filter((id) => !!id))];
    if (householdIds.length === 0) return [];
    const rows = (await this.getDb().selectFrom("people")
      .select(["id", "displayName", "mobilePhone", "optedOut"])
      .where("churchId", "=", churchId)
      .where("removed", "=", 0)
      .where("householdId", "in", householdIds)
      .where((eb: any) => eb.or([eb("householdRole", "is", null), eb("householdRole", "!=", "Child")]))
      .execute()) as any[];
    return rows.map((r) => ({
      personId: r.id,
      name: r.displayName || "",
      mobilePhone: r.mobilePhone || "",
      optedOut: r.optedOut === true || r.optedOut === 1
    }));
  }

  public async setPersonField(churchId: string, personId: string, field: string, value: string): Promise<void> {
    if (!MembershipModuleGatewayDb.ALLOWED_FIELDS.has(field)) throw new Error(`Invalid person field: ${field}`);
    await this.getDb().updateTable("people")
      .set({ [field]: value })
      .where("churchId", "=", churchId)
      .where("id", "=", personId)
      .execute();
  }
}

let _instance: MembershipModuleGateway;
export const getMembershipModuleGateway = (): MembershipModuleGateway => (_instance ??= new MembershipModuleGatewayDb());
