import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { people } from "../../../db/schema/membership.js";
import { Person } from "../models/index.js";
import { DateHelper, PersonHelper } from "../helpers/index.js";
import { CollectionHelper } from "../../../shared/helpers/index.js";

@injectable()
export class PersonRepo extends DrizzleRepo<typeof people> {
  protected readonly table = people;
  protected readonly moduleName = "membership";
  protected readonly softDelete = true;

  public async save(person: Person) {
    person.name.display = PersonHelper.getDisplayNameFromPerson(person);
    if (person.id) {
      return this.update(person);
    } else {
      return this.create(person);
    }
  }

  protected async create(person: Person): Promise<Person> {
    person.id = UniqueIdHelper.shortId();
    const data: any = this.modelToRow(person);
    data.id = person.id;
    data.churchId = person.churchId;
    data.removed = false;
    data.birthDate = DateHelper.toMysqlDateOnly(person.birthDate);
    data.anniversary = DateHelper.toMysqlDateOnly(person.anniversary);
    data.photoUpdated = DateHelper.toMysqlDate(person.photoUpdated);
    await this.db.insert(people).values(data);
    return person;
  }

  protected async update(person: Person): Promise<Person> {
    const data: any = this.modelToRow(person);
    data.birthDate = DateHelper.toMysqlDateOnly(person.birthDate);
    data.anniversary = DateHelper.toMysqlDateOnly(person.anniversary);
    data.photoUpdated = DateHelper.toMysqlDate(person.photoUpdated);
    await this.db.update(people).set(data)
      .where(and(eq(people.id, person.id!), eq(people.churchId, person.churchId!)));
    return person;
  }

  private modelToRow(person: Person): any {
    return {
      displayName: person.name?.display,
      firstName: person.name?.first,
      middleName: person.name?.middle,
      lastName: person.name?.last,
      nickName: person.name?.nick,
      prefix: person.name?.prefix,
      suffix: person.name?.suffix,
      gender: person.gender,
      maritalStatus: person.maritalStatus,
      membershipStatus: person.membershipStatus,
      homePhone: person.contactInfo?.homePhone,
      mobilePhone: person.contactInfo?.mobilePhone,
      workPhone: person.contactInfo?.workPhone,
      email: person.contactInfo?.email,
      address1: person.contactInfo?.address1,
      address2: person.contactInfo?.address2,
      city: person.contactInfo?.city,
      state: person.contactInfo?.state,
      zip: person.contactInfo?.zip,
      householdId: person.householdId,
      householdRole: person.householdRole,
      conversationId: person.conversationId,
      optedOut: person.optedOut,
      nametagNotes: person.nametagNotes,
      donorNumber: person.donorNumber,
      userId: (person as any).userId
    };
  }

  public updateOptedOut(personId: string, optedOut: boolean) {
    return this.db.update(people).set({ optedOut } as any).where(eq(people.id, personId));
  }

  public async updateHousehold(person: Person) {
    await this.db.update(people).set({ householdId: person.householdId, householdRole: person.householdRole } as any)
      .where(and(eq(people.id, person.id!), eq(people.churchId, person.churchId!)));
    return person;
  }

  public restore(churchId: string, id: string) {
    return this.db.update(people).set({ removed: false } as any)
      .where(and(eq(people.id, id), eq(people.churchId, churchId)));
  }

  public load(churchId: string, id: string) {
    return this.db.select().from(people)
      .where(and(eq(people.id, id), eq(people.churchId, churchId), eq(people.removed, false)))
      .then(r => r[0] ? this.rowToModel(r[0]) : null);
  }

  public loadAll(churchId: string) {
    return this.db.select().from(people)
      .where(and(eq(people.churchId, churchId), eq(people.removed, false)))
      .then((rows: any[]) => rows.map(r => this.rowToModel(r)));
  }

  public loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(people)
      .where(and(inArray(people.id, ids), eq(people.churchId, churchId), eq(people.removed, false)))
      .then((rows: any[]) => rows.map(r => this.rowToModel(r)));
  }

  public loadByIdsOnly(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(people)
      .where(and(inArray(people.id, ids), eq(people.removed, false)))
      .then((rows: any[]) => rows.map(r => this.rowToModel(r)));
  }

  public async loadMembers(churchId: string) {
    const rows = await this.executeRows(sql`
      SELECT * FROM people WHERE churchId=${churchId} AND removed=0 AND membershipStatus IN ('Member', 'Staff')
    `);
    return rows.map(r => this.rowToModel(r));
  }

  public async loadMembersByVisibility(churchId: string, directoryVisibility: string) {
    let statuses: string[];
    switch (directoryVisibility) {
      case "Staff": statuses = ["Staff"]; break;
      case "Members": statuses = ["Member", "Staff"]; break;
      case "Regular Attendees": statuses = ["Regular Attendee", "Member", "Staff"]; break;
      case "Everyone": statuses = ["Visitor", "Regular Attendee", "Member", "Staff"]; break;
      default: statuses = ["Member", "Staff"]; break;
    }
    return this.db.select().from(people)
      .where(and(eq(people.churchId, churchId), eq(people.removed, false), inArray(people.membershipStatus, statuses)))
      .then((rows: any[]) => rows.map(r => this.rowToModel(r)));
  }

  public async loadRecent(churchId: string, filterOptedOut?: boolean) {
    const filter = filterOptedOut ? sql` AND (optedOut = FALSE OR optedOut IS NULL)` : sql``;
    const rows = await this.executeRows(sql`
      SELECT * FROM (SELECT * FROM people WHERE churchId=${churchId} AND removed=0${filter} ORDER BY id DESC LIMIT 25) people ORDER BY lastName, firstName
    `);
    return rows.map(r => this.rowToModel(r));
  }

  public loadByHousehold(churchId: string, householdId: string) {
    return this.db.select().from(people)
      .where(and(eq(people.churchId, churchId), eq(people.householdId, householdId), eq(people.removed, false)))
      .then((rows: any[]) => rows.map(r => this.rowToModel(r)));
  }

  public async search(churchId: string, term: string, filterOptedOut?: boolean) {
    const searchTerm = "%" + term.replace(" ", "%") + "%";
    const filter = filterOptedOut ? sql` AND (optedOut = FALSE OR optedOut IS NULL)` : sql``;
    const rows = await this.executeRows(sql`
      SELECT * FROM people WHERE churchId=${churchId}
      AND concat(IFNULL(FirstName,''), ' ', IFNULL(MiddleName,''), ' ', IFNULL(NickName,''), ' ', IFNULL(LastName,''), ' ', IFNULL(donorNumber,'')) LIKE ${searchTerm}
      AND removed=0${filter} LIMIT 100
    `);
    return rows.map(r => this.rowToModel(r));
  }

  public async searchPhone(churchId: string, phonestring: string) {
    const phoneSearch = "%" + phonestring.replace(/ |-/g, "%") + "%";
    const rows = await this.executeRows(sql`
      SELECT * FROM people WHERE churchId=${churchId}
      AND (REPLACE(REPLACE(HomePhone,'-',''), ' ', '') LIKE ${phoneSearch}
        OR REPLACE(REPLACE(WorkPhone,'-',''), ' ', '') LIKE ${phoneSearch}
        OR REPLACE(REPLACE(MobilePhone,'-',''), ' ', '') LIKE ${phoneSearch})
      AND removed=0 LIMIT 100
    `);
    return rows.map(r => this.rowToModel(r));
  }

  public async searchEmail(churchId: string, email: string) {
    const emailSearch = "%" + email + "%";
    const rows = await this.executeRows(sql`
      SELECT * FROM people WHERE churchId=${churchId} AND email LIKE ${emailSearch} AND removed=0 LIMIT 100
    `);
    return rows.map(r => this.rowToModel(r));
  }

  public async loadAttendees(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, categoryName: string, groupId: string, startDate: Date, endDate: Date) {
    const conditions: any[] = [
      sql`p.churchId = ${churchId}`,
      sql`v.visitDate BETWEEN ${startDate} AND ${endDate}`
    ];

    if (!UniqueIdHelper.isMissing(campusId)) conditions.push(sql`ser.campusId=${campusId}`);
    if (!UniqueIdHelper.isMissing(serviceId)) conditions.push(sql`ser.id=${serviceId}`);
    if (!UniqueIdHelper.isMissing(serviceTimeId)) conditions.push(sql`st.id=${serviceTimeId}`);
    if (categoryName !== "") conditions.push(sql`g.categoryName=${categoryName}`);
    if (!UniqueIdHelper.isMissing(groupId)) conditions.push(sql`g.id=${groupId}`);

    const whereClause = sql.join(conditions, sql` AND `);
    const rows = await this.executeRows(sql`
      SELECT p.Id, p.churchId, p.displayName, p.firstName, p.lastName, p.photoUpdated
      FROM visitSessions vs
      INNER JOIN visits v on v.id = vs.visitId
      INNER JOIN sessions s on s.id = vs.sessionId
      INNER JOIN people p on p.id = v.personId
      INNER JOIN \`groups\` g on g.id = s.groupId
      LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId
      LEFT OUTER JOIN services ser on ser.id = st.serviceId
      WHERE ${whereClause}
      GROUP BY p.id, p.displayName, p.firstName, p.lastName, p.photoUpdated
      ORDER BY p.lastName, p.firstName
    `);
    return rows.map(r => this.rowToModel(r));
  }

  protected rowToModel(row: any): Person {
    const result: Person = {
      name: {
        display: row.displayName,
        first: row.firstName,
        last: row.lastName,
        middle: row.middleName,
        nick: row.nickName,
        prefix: row.prefix,
        suffix: row.suffix
      },
      contactInfo: {
        address1: row.address1,
        address2: row.address2,
        city: row.city,
        state: row.state,
        zip: row.zip,
        homePhone: row.homePhone,
        workPhone: row.workPhone,
        email: row.email,
        mobilePhone: row.mobilePhone
      },
      photo: row.photo,
      anniversary: row.anniversary,
      birthDate: row.birthDate,
      gender: row.gender,
      householdId: row.householdId,
      householdRole: row.householdRole,
      maritalStatus: row.maritalStatus,
      nametagNotes: row.nametagNotes,
      donorNumber: row.donorNumber,
      membershipStatus: row.membershipStatus,
      photoUpdated: row.photoUpdated ? new Date(row.photoUpdated) : undefined,
      id: row.id,
      churchId: row.churchId,
      importKey: row.importKey,
      optedOut: row.optedOut,
      conversationId: row.conversationId
    };
    if (result.photo === undefined) result.photo = PersonHelper.getPhotoPath(row.churchId, result);
    return result;
  }

  /** Detect if data is already a Person model (has nested name object) vs a raw DB row. */
  private isPersonModel(data: any): boolean {
    return data?.name !== undefined && typeof data.name === "object";
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.isPersonModel(data) ? data : this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.isPersonModel(d) ? d : this.rowToModel(d));
  }

  public convertToModelWithPermissions(_churchId: string, data: any, canEdit: boolean) {
    const result = this.isPersonModel(data) ? data : this.rowToModel(data);
    if (!canEdit) delete result.conversationId;
    return result;
  }

  public convertAllToModelWithPermissions(churchId: string, data: any, canEdit: boolean) {
    return CollectionHelper.convertAll<Person>(data, (d: any) => this.convertToModelWithPermissions(churchId, d, canEdit));
  }

  public convertAllToBasicModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Person>(data, (d: any) => this.convertToBasicModel(churchId, d));
  }

  public convertToBasicModel(churchId: string, data: any) {
    const isModel = this.isPersonModel(data);
    const result: Person = {
      name: { display: isModel ? data.name.display : data.displayName },
      contactInfo: {},
      photo: data.photo,
      photoUpdated: data.photoUpdated ? new Date(data.photoUpdated) : undefined,
      membershipStatus: data.membershipStatus,
      id: data.id
    };
    if (result.photo === undefined) result.photo = PersonHelper.getPhotoPath(churchId, result);
    return result;
  }

  public convertToPreferenceModel(churchId: string, data: Person) {
    const result: Person = {
      name: { display: data.name.display },
      contactInfo: data.contactInfo,
      photo: data.photo,
      photoUpdated: data.photoUpdated,
      membershipStatus: data.membershipStatus,
      id: data.id
    };
    if (result.photo === undefined) result.photo = PersonHelper.getPhotoPath(churchId, result);
    return result;
  }
}
