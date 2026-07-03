import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper, PersonHelper } from "../helpers/index.js";
import { Person } from "../models/index.js";
import { CollectionHelper } from "../../../shared/helpers/index.js";

@injectable()
export class PersonRepo {
  public async save(person: Person) {
    person.name.display = PersonHelper.getDisplayNameFromPerson(person);
    return person.id ? this.update(person) : this.create(person);
  }

  private prepareDateFields(person: Person) {
    (person as any).birthDate = DateHelper.toMysqlDateOnly(person.birthDate);
    (person as any).anniversary = DateHelper.toMysqlDateOnly(person.anniversary);
    (person as any).photoUpdated = DateHelper.toMysqlDate(person.photoUpdated);
  }

  private prepareContactFields(person: Person) {
    (person as any).homePhone = person.contactInfo?.homePhone;
    (person as any).mobilePhone = person.contactInfo?.mobilePhone;
    (person as any).workPhone = person.contactInfo?.workPhone;
    (person as any).email = person.contactInfo?.email;
    (person as any).address1 = person.contactInfo?.address1;
    (person as any).address2 = person.contactInfo?.address2;
    (person as any).city = person.contactInfo?.city;
    (person as any).state = person.contactInfo?.state;
    (person as any).zip = person.contactInfo?.zip;

    (person as any).displayName = person.name?.display;
    (person as any).firstName = person.name?.first;
    (person as any).middleName = person.name?.middle;
    (person as any).lastName = person.name?.last;
    (person as any).nickName = person.name?.nick;
    (person as any).prefix = person.name?.prefix;
    (person as any).suffix = person.name?.suffix;
  }

  private async create(person: Person): Promise<Person> {
    person.id = UniqueIdHelper.shortId();
    this.prepareDateFields(person);
    this.prepareContactFields(person);
    const p = person as any;
    await getDb().insertInto("people").values({
      id: person.id,
      churchId: person.churchId,
      displayName: p.displayName,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      nickName: p.nickName,
      prefix: p.prefix,
      suffix: p.suffix,
      birthDate: p.birthDate,
      gender: person.gender,
      maritalStatus: person.maritalStatus,
      anniversary: p.anniversary,
      membershipStatus: person.membershipStatus,
      grade: person.grade,
      school: person.school,
      homePhone: p.homePhone,
      mobilePhone: p.mobilePhone,
      workPhone: p.workPhone,
      email: p.email,
      address1: p.address1,
      address2: p.address2,
      city: p.city,
      state: p.state,
      zip: p.zip,
      photoUpdated: p.photoUpdated,
      householdId: person.householdId,
      householdRole: person.householdRole,
      campusId: person.campusId,
      conversationId: person.conversationId,
      optedOut: person.optedOut,
      nametagNotes: person.nametagNotes,
      donorNumber: person.donorNumber,
      importKey: person.importKey,
      removed: false
    }).execute();
    return person;
  }

  private async update(person: Person): Promise<Person> {
    this.prepareDateFields(person);
    this.prepareContactFields(person);
    const p = person as any;
    await getDb().updateTable("people").set({
      displayName: p.displayName,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      nickName: p.nickName,
      prefix: p.prefix,
      suffix: p.suffix,
      birthDate: p.birthDate,
      gender: person.gender,
      maritalStatus: person.maritalStatus,
      anniversary: p.anniversary,
      membershipStatus: person.membershipStatus,
      grade: person.grade,
      school: person.school,
      homePhone: p.homePhone,
      mobilePhone: p.mobilePhone,
      workPhone: p.workPhone,
      email: p.email,
      address1: p.address1,
      address2: p.address2,
      city: p.city,
      state: p.state,
      zip: p.zip,
      photoUpdated: p.photoUpdated,
      householdId: person.householdId,
      householdRole: person.householdRole,
      campusId: person.campusId,
      conversationId: person.conversationId,
      optedOut: person.optedOut,
      nametagNotes: person.nametagNotes,
      donorNumber: person.donorNumber,
      importKey: person.importKey
    }).where("id", "=", person.id).where("churchId", "=", person.churchId).execute();
    return person;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("people").set({ removed: true as any }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByIds(churchId: string, ids: string[]) {
    if (!ids.length) return;
    await getDb().updateTable("people").set({ removed: true as any }).where("id", "in", ids).where("churchId", "=", churchId).execute();
  }

  public async updateFieldsByIds(churchId: string, ids: string[], fields: Record<string, any>) {
    if (!ids.length || !Object.keys(fields).length) return;
    await getDb().updateTable("people").set(fields).where("id", "in", ids).where("churchId", "=", churchId).execute();
  }

  public async updateOptedOut(churchId: string, personId: string, optedOut: boolean) {
    await getDb().updateTable("people").set({ optedOut: optedOut as any }).where("id", "=", personId).where("churchId", "=", churchId).execute();
  }

  public async updateHousehold(person: Person) {
    await getDb().updateTable("people").set({
      householdId: person.householdId,
      householdRole: person.householdRole
    }).where("id", "=", person.id).where("churchId", "=", person.churchId).execute();
    return person;
  }

  public async restore(churchId: string, id: string) {
    await getDb().updateTable("people").set({ removed: false as any }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("people").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false as any).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("people").selectAll().where("churchId", "=", churchId).where("removed", "=", false as any).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("people").selectAll().where("id", "in", ids).where("churchId", "=", churchId).execute();
  }

  public async loadByIdsOnly(ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("people").selectAll().where("id", "in", ids).execute();
  }

  public async loadMembers(churchId: string) {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any)
      .where("membershipStatus", "in", ["Member", "Staff"])
      .execute();
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
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any)
      .where("membershipStatus", "in", statuses)
      .where((eb) => eb.or([eb("optedOut", "=", false as any), eb("optedOut", "is", null)]))
      .execute();
  }

  public async loadRecent(churchId: string, filterOptedOut?: boolean) {
    let q = getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any);
    if (filterOptedOut) q = q.where((eb) => eb.or([eb("optedOut", "=", false as any), eb("optedOut", "is", null)]));
    const subResult = await q.orderBy("id", "desc").limit(25).execute();
    subResult.sort((a: any, b: any) => {
      const lastCmp = (a.lastName || "").localeCompare(b.lastName || "");
      if (lastCmp !== 0) return lastCmp;
      return (a.firstName || "").localeCompare(b.firstName || "");
    });
    return subResult;
  }

  public async loadAlphabetical(churchId: string, pageSize: number, filterOptedOut?: boolean) {
    let q = getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any);
    if (filterOptedOut) q = q.where((eb) => eb.or([eb("optedOut", "=", false as any), eb("optedOut", "is", null)]));
    q = q.orderBy("lastName", "asc").orderBy("firstName", "asc");
    if (pageSize > 0) q = q.limit(pageSize);
    return q.execute();
  }

  public async loadByHousehold(churchId: string, householdId: string) {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("householdId", "=", householdId)
      .where("removed", "=", false as any)
      .execute();
  }

  public async search(churchId: string, term: string, filterOptedOut?: boolean) {
    const searchTerm = "%" + term.replace(" ", "%") + "%";
    let query = getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where(sql`CONCAT(IFNULL(FirstName,''), ' ', IFNULL(MiddleName,''), ' ', IFNULL(NickName,''), ' ', IFNULL(LastName,''), ' ', IFNULL(donorNumber,''))`, "like", searchTerm)
      .where("removed", "=", 0 as any);
    if (filterOptedOut) query = query.where((eb) => eb.or([eb("optedOut", "=", false as any), eb("optedOut", "is", null)]));
    return query.limit(100).execute();
  }

  public async searchPhone(churchId: string, phonestring: string) {
    const phoneSearch = "%" + phonestring.replace(/ |-/g, "%") + "%";
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where((eb) => eb.or([
        eb(sql`REPLACE(REPLACE(HomePhone,'-',''), ' ', '')`, "like", phoneSearch),
        eb(sql`REPLACE(REPLACE(WorkPhone,'-',''), ' ', '')`, "like", phoneSearch),
        eb(sql`REPLACE(REPLACE(MobilePhone,'-',''), ' ', '')`, "like", phoneSearch)
      ]))
      .where("removed", "=", 0 as any)
      .limit(100)
      .execute();
  }

  public async searchEmail(churchId: string, email: string): Promise<any[]> {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("email", "like", "%" + email + "%")
      .where("removed", "=", false as any)
      .limit(100)
      .execute() as any;
  }

  public async loadAttendees(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, categoryName: string, groupId: string, startDate: Date, endDate: Date) {
    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`p.churchId = ${churchId} AND v.visitDate BETWEEN ${startDate as any} AND ${endDate as any}`);

    if (!UniqueIdHelper.isMissing(campusId)) conditions.push(sql`ser.campusId=${campusId}`);
    if (!UniqueIdHelper.isMissing(serviceId)) conditions.push(sql`ser.id=${serviceId}`);
    if (!UniqueIdHelper.isMissing(serviceTimeId)) conditions.push(sql`st.id=${serviceTimeId}`);
    if (categoryName !== "") conditions.push(sql`g.categoryName=${categoryName}`);
    if (!UniqueIdHelper.isMissing(groupId)) conditions.push(sql`g.id=${groupId}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const result = await sql`SELECT p.Id, p.churchId, p.displayName, p.firstName, p.lastName, p.photoUpdated FROM visitSessions vs INNER JOIN visits v ON v.id = vs.visitId INNER JOIN sessions s ON s.id = vs.sessionId INNER JOIN people p ON p.id = v.personId INNER JOIN \`groups\` g ON g.id = s.groupId LEFT OUTER JOIN serviceTimes st ON st.id = s.serviceTimeId LEFT OUTER JOIN services ser ON ser.id = st.serviceId WHERE ${whereClause} GROUP BY p.id, p.displayName, p.firstName, p.lastName, p.photoUpdated ORDER BY p.lastName, p.firstName`.execute(getDb());
    return result.rows;
  }

  public async loadDemographics(churchId: string) {
    const db = getDb();

    const countByColumn = async (column: "gender" | "membershipStatus" | "maritalStatus") => {
      const bucket = sql<string>`COALESCE(NULLIF(TRIM(${sql.ref(column)}), ''), 'Unassigned')`;
      const rows = await db.selectFrom("people")
        .select((eb) => [bucket.as("name"), eb.fn.countAll<number>().as("count")])
        .where("churchId", "=", churchId)
        .where("removed", "=", false as any)
        .groupBy(bucket)
        .orderBy(sql`COUNT(*)`, "desc")
        .execute();
      return rows.map((r) => ({ name: r.name as string, count: Number(r.count) }));
    };

    const [gender, membershipStatus, maritalStatus] = await Promise.all([countByColumn("gender"), countByColumn("membershipStatus"), countByColumn("maritalStatus")]);

    const ageRows = await sql`SELECT
        CASE
          WHEN age BETWEEN 0 AND 3 THEN '0-3'
          WHEN age BETWEEN 4 AND 11 THEN '4-11'
          WHEN age BETWEEN 12 AND 18 THEN '12-18'
          WHEN age BETWEEN 19 AND 25 THEN '19-25'
          WHEN age BETWEEN 26 AND 35 THEN '26-35'
          WHEN age BETWEEN 36 AND 50 THEN '36-50'
          WHEN age BETWEEN 51 AND 64 THEN '51-64'
          ELSE '65+'
        END AS ageGroup,
        COALESCE(NULLIF(TRIM(gender), ''), 'Unassigned') AS gender,
        COUNT(*) AS count
      FROM (
        SELECT TIMESTAMPDIFF(YEAR, birthDate, CURDATE()) AS age, gender
        FROM people WHERE churchId = ${churchId} AND removed = 0 AND birthDate IS NOT NULL
      ) sub
      GROUP BY ageGroup, gender`.execute(db);

    const order = [
      "0-3", "4-11", "12-18", "19-25", "26-35", "36-50", "51-64", "65+"
    ];
    const ageMap: { [group: string]: { group: string; female: number; male: number; unassigned: number } } = {};
    order.forEach((g) => (ageMap[g] = { group: g, female: 0, male: 0, unassigned: 0 }));
    (ageRows.rows as any[]).forEach((r) => {
      const bucket = ageMap[r.ageGroup];
      if (!bucket) return;
      const g = String(r.gender).toLowerCase();
      const key = g === "female" ? "female" : g === "male" ? "male" : "unassigned";
      bucket[key] += Number(r.count);
    });

    const campusRows = await sql<{ name: string; id: string | null; count: number }>`
      SELECT COALESCE(c.name, 'Unassigned') AS name, p.campusId AS id, COUNT(*) AS count
      FROM people p
      LEFT JOIN campuses c ON c.id = p.campusId
      WHERE p.churchId = ${churchId} AND p.removed = 0
      GROUP BY p.campusId, c.name
      ORDER BY COUNT(*) DESC`.execute(db);
    const campus = (campusRows.rows as any[]).map((r) => ({ name: String(r.name), id: (r.id as string) || "", count: Number(r.count) }));

    const total = gender.reduce((sum, r) => sum + r.count, 0);

    return { total, ageGroups: order.map((g) => ageMap[g]), membershipStatus, gender, maritalStatus, campus };
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
      campusId: row.campusId,
      maritalStatus: row.maritalStatus,
      nametagNotes: row.nametagNotes,
      donorNumber: row.donorNumber,
      membershipStatus: row.membershipStatus,
      grade: row.grade,
      school: row.school,
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

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }

  public convertToModelWithPermissions(_churchId: string, data: any, canEdit: boolean) {
    const result = this.rowToModel(data);
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
    const result: Person = {
      name: { display: data.displayName },
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

  public saveAll(models: Person[]) {
    const promises: Promise<Person>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Person): Promise<Person> {
    return this.create(model);
  }
}
