import { injectable } from "inversify";
import { sql, type Updateable } from "kysely";
import { getDb } from "../db/index.js";
import type { MembershipDatabase } from "../db/DatabaseTypes.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper, PersonHelper } from "../helpers/index.js";
import { Person } from "../models/index.js";
import { CollectionHelper } from "../../../shared/helpers/index.js";

type PeopleRow = MembershipDatabase["people"];

/** people row (flat name/contact columns); photo is set when a caller has already resolved it. */
interface PersonRow extends Omit<PeopleRow, "photoUpdated" | "dateAdded"> {
  photo?: string;
  photoUpdated?: Date | string;
  dateAdded?: Date | string;
}

/** A Person after save() has flattened name/contact onto it and formatted its dates for MySQL. */
interface PreparedPerson extends Omit<Person, "birthDate" | "anniversary" | "photoUpdated"> {
  birthDate?: Date | string | null;
  anniversary?: Date | string | null;
  photoUpdated?: Date | string | null;
  displayName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickName?: string;
  prefix?: string;
  suffix?: string;
  homePhone?: string;
  mobilePhone?: string;
  workPhone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface AttendeeRow {
  Id: string;
  churchId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  photoUpdated: Date;
}

interface AgeGenderCountRow {
  ageGroup: string;
  gender: string;
  count: number;
}

@injectable()
export class PersonRepo {
  public async save(person: Person) {
    person.name!.display = PersonHelper.getDisplayNameFromPerson(person);
    return person.id ? this.update(person) : this.create(person);
  }

  private prepareDateFields(person: PreparedPerson) {
    person.birthDate = DateHelper.toMysqlDateOnly(person.birthDate);
    person.anniversary = DateHelper.toMysqlDateOnly(person.anniversary);
    person.photoUpdated = DateHelper.toMysqlDate(person.photoUpdated);
  }

  private prepareContactFields(person: PreparedPerson) {
    person.homePhone = person.contactInfo?.homePhone;
    person.mobilePhone = person.contactInfo?.mobilePhone;
    person.workPhone = person.contactInfo?.workPhone;
    person.email = person.contactInfo?.email;
    person.address1 = person.contactInfo?.address1;
    person.address2 = person.contactInfo?.address2;
    person.city = person.contactInfo?.city;
    person.state = person.contactInfo?.state;
    person.zip = person.contactInfo?.zip;

    person.displayName = person.name?.display;
    person.firstName = person.name?.first;
    person.middleName = person.name?.middle;
    person.lastName = person.name?.last;
    person.nickName = person.name?.nick;
    person.prefix = person.name?.prefix;
    person.suffix = person.name?.suffix;
  }

  private async create(person: Person): Promise<Person> {
    person.id = UniqueIdHelper.shortId();
    // Stamped by the server on insert only; any client-supplied value is ignored.
    person.dateAdded = new Date();
    this.prepareDateFields(person);
    this.prepareContactFields(person);
    const p: PreparedPerson = person;
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
      birthDate: p.birthDate as Date,
      gender: person.gender,
      maritalStatus: person.maritalStatus,
      anniversary: p.anniversary as Date,
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
      photoUpdated: p.photoUpdated as Date,
      householdId: person.householdId,
      householdRole: person.householdRole,
      campusId: person.campusId,
      conversationId: person.conversationId,
      optedOut: person.optedOut,
      nametagNotes: person.nametagNotes,
      donorNumber: person.donorNumber,
      importKey: person.importKey,
      dateAdded: person.dateAdded,
      removed: false
    }).execute();
    return person;
  }

  private async update(person: Person): Promise<Person> {
    this.prepareDateFields(person);
    this.prepareContactFields(person);
    const p: PreparedPerson = person;
    await getDb().updateTable("people").set({
      displayName: p.displayName,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      nickName: p.nickName,
      prefix: p.prefix,
      suffix: p.suffix,
      birthDate: p.birthDate as Date,
      gender: person.gender,
      maritalStatus: person.maritalStatus,
      anniversary: p.anniversary as Date,
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
      photoUpdated: p.photoUpdated as Date,
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
    await getDb().updateTable("people").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByIds(churchId: string, ids: string[]) {
    if (!ids.length) return;
    await getDb().updateTable("people").set({ removed: true }).where("id", "in", ids).where("churchId", "=", churchId).execute();
  }

  public async updateFieldsByIds(churchId: string, ids: string[], fields: Updateable<MembershipDatabase["people"]>) {
    if (!ids.length || !Object.keys(fields).length) return;
    await getDb().updateTable("people").set(fields).where("id", "in", ids).where("churchId", "=", churchId).execute();
  }

  public async updateOptedOut(churchId: string, personId: string, optedOut: boolean) {
    await getDb().updateTable("people").set({ optedOut }).where("id", "=", personId).where("churchId", "=", churchId).execute();
  }

  public async updateSmsOptedOut(churchId: string, personId: string, smsOptedOut: boolean) {
    await getDb().updateTable("people").set({ smsOptedOut }).where("id", "=", personId).where("churchId", "=", churchId).execute();
  }

  public async updateHousehold(person: Person) {
    await getDb().updateTable("people").set({
      householdId: person.householdId,
      householdRole: person.householdRole
    }).where("id", "=", person.id).where("churchId", "=", person.churchId).execute();
    return person;
  }

  public async restore(churchId: string, id: string) {
    await getDb().updateTable("people").set({ removed: false }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("people").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("people").selectAll().where("churchId", "=", churchId).where("removed", "=", false).orderBy("lastName", "asc").orderBy("firstName", "asc").execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("people").selectAll().where("id", "in", ids).where("churchId", "=", churchId).orderBy("lastName", "asc").orderBy("firstName", "asc").execute();
  }

  public async loadByIdsOnly(ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("people").selectAll().where("id", "in", ids).orderBy("lastName", "asc").orderBy("firstName", "asc").execute();
  }

  public async loadMembers(churchId: string) {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where("membershipStatus", "in", ["Member", "Staff"])
      .orderBy("lastName", "asc").orderBy("firstName", "asc")
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
      .where("removed", "=", false)
      .where("membershipStatus", "in", statuses)
      .where((eb) => eb.or([eb("optedOut", "=", false), eb("optedOut", "is", null)]))
      .orderBy("lastName", "asc").orderBy("firstName", "asc")
      .execute();
  }

  public async loadRecent(churchId: string, filterOptedOut?: boolean) {
    let q = getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false);
    if (filterOptedOut) q = q.where((eb) => eb.or([eb("optedOut", "=", false), eb("optedOut", "is", null)]));
    // Ids are random shortIds, so order by dateAdded (newest first, older NULL rows last).
    return q.orderBy(sql`dateAdded IS NULL`).orderBy("dateAdded", "desc").orderBy("id", "desc").limit(25).execute();
  }

  public async loadAlphabetical(churchId: string, pageSize: number, filterOptedOut?: boolean) {
    let q = getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false);
    if (filterOptedOut) q = q.where((eb) => eb.or([eb("optedOut", "=", false), eb("optedOut", "is", null)]));
    q = q.orderBy("lastName", "asc").orderBy("firstName", "asc");
    if (pageSize > 0) q = q.limit(pageSize);
    return q.execute();
  }

  public async loadByHousehold(churchId: string, householdId: string) {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("householdId", "=", householdId)
      .where("removed", "=", false)
      .orderBy("lastName", "asc").orderBy("firstName", "asc")
      .execute();
  }

  public async search(churchId: string, term: string, filterOptedOut?: boolean) {
    const searchTerm = "%" + term.replace(" ", "%") + "%";
    let query = getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where(sql`CONCAT(IFNULL(FirstName,''), ' ', IFNULL(MiddleName,''), ' ', IFNULL(NickName,''), ' ', IFNULL(LastName,''), ' ', IFNULL(donorNumber,''))`, "like", searchTerm)
      .where(sql.ref<number>("removed"), "=", 0);
    if (filterOptedOut) query = query.where((eb) => eb.or([eb("optedOut", "=", false), eb("optedOut", "is", null)]));
    return query.orderBy("lastName", "asc").orderBy("firstName", "asc").limit(100).execute();
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
      .where(sql.ref<number>("removed"), "=", 0)
      .orderBy("lastName", "asc").orderBy("firstName", "asc")
      .limit(100)
      .execute();
  }

  public async searchEmail(churchId: string, email: string) {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("email", "like", "%" + email + "%")
      .where("removed", "=", false)
      .orderBy("lastName", "asc").orderBy("firstName", "asc")
      .limit(100)
      .execute();
  }

  // Same as searchEmail but keeps deleted rows, so a returning user can be restored instead of duplicated.
  // Only for callers that are allowed to undelete (see PersonHelper.getPerson allowRestore); anon callers
  // must use searchEmail so a deleted person can never be resurrected from the outside.
  public async searchEmailIncludingRemoved(churchId: string, email: string) {
    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("email", "like", "%" + email + "%")
      .orderBy("removed", "asc") // prefer a live person over a deleted duplicate
      .limit(100)
      .execute();
  }

  // Inbound STOP lookup: any live person in the church whose mobile matches, with or without the US country code.
  public async loadIdsByMobileDigits(churchId: string, digits: string): Promise<string[]> {
    const local = digits.replace(/^1(\d{10})$/, "$1");
    const variants = [...new Set([digits, local, "1" + local])].filter((d) => d.length >= 7);
    if (!variants.length) return [];
    const rows = await getDb().selectFrom("people").select(["id"])
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where(this.phoneDigitsSql("MobilePhone"), "in", variants)
      .execute();
    return rows.map((r) => r.id);
  }

  // Digits-only compare so "(555) 123-4567" matches "555-123-4567".
  private phoneDigitsSql(column: string) {
    return sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${sql.ref(column)},'-',''),' ',''),'(',''),')',''),'+','')`;
  }

  public async findPossibleDuplicates(churchId: string, params: { email?: string; phone?: string; firstName?: string; lastName?: string; birthDate?: Date | string }) {
    const email = params.email?.trim().toLowerCase();
    const phoneDigits = (params.phone || "").replace(/\D/g, "");
    const firstName = params.firstName?.trim().toLowerCase();
    const lastName = params.lastName?.trim().toLowerCase();
    const birthDate = params.birthDate ? DateHelper.toMysqlDateOnly(params.birthDate) : null;
    if (!email && !phoneDigits && !(firstName && lastName && birthDate)) return [];

    return getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where((eb) => {
        const clauses = [];
        if (email) clauses.push(eb(sql`LOWER(email)`, "=", email));
        if (phoneDigits) {
          clauses.push(eb(this.phoneDigitsSql("HomePhone"), "=", phoneDigits));
          clauses.push(eb(this.phoneDigitsSql("WorkPhone"), "=", phoneDigits));
          clauses.push(eb(this.phoneDigitsSql("MobilePhone"), "=", phoneDigits));
        }
        if (firstName && lastName && birthDate) {
          clauses.push(eb.and([eb(sql`LOWER(FirstName)`, "=", firstName), eb(sql`LOWER(LastName)`, "=", lastName), eb(sql.ref<string>("birthDate"), "=", birthDate)]));
        }
        return eb.or(clauses);
      })
      .orderBy("lastName", "asc").orderBy("firstName", "asc")
      .limit(25)
      .execute();
  }

  // Church-wide pairs using the findPossibleDuplicates keys. Email and phone also require the same
  // first name, as findGuestMatch does, so a household sharing one number or inbox isn't listed.
  // Keys shared by more than maxGroupSize people (an office line, a placeholder email) are skipped.
  public async findPossibleDuplicatePairs(churchId: string, maxPairs = 100, maxGroupSize = 6) {
    const first = sql`LOWER(TRIM(firstName))`;
    const phoneKey = (column: string) => sql`SELECT id, 'phone' AS matchType, CONCAT(${first}, '|', ${this.phoneDigitsSql(column)}) AS matchKey FROM people
      WHERE churchId = ${churchId} AND removed = 0 AND TRIM(IFNULL(firstName, '')) <> '' AND CHAR_LENGTH(${this.phoneDigitsSql(column)}) >= 7`;
    const result = await sql<{ matchType: string; ids: string }>`
      SELECT matchType, GROUP_CONCAT(DISTINCT id ORDER BY id) AS ids
      FROM (
        SELECT id, 'email' AS matchType, CONCAT(${first}, '|', LOWER(TRIM(email))) AS matchKey FROM people
        WHERE churchId = ${churchId} AND removed = 0 AND TRIM(IFNULL(firstName, '')) <> '' AND email LIKE '%@%'
        UNION ALL ${phoneKey("homePhone")}
        UNION ALL ${phoneKey("workPhone")}
        UNION ALL ${phoneKey("mobilePhone")}
        UNION ALL
        SELECT id, 'nameBirthDate' AS matchType, CONCAT(${first}, '|', LOWER(TRIM(lastName)), '|', birthDate) AS matchKey FROM people
        WHERE churchId = ${churchId} AND removed = 0 AND TRIM(IFNULL(firstName, '')) <> '' AND TRIM(IFNULL(lastName, '')) <> '' AND birthDate IS NOT NULL
      ) keyed
      GROUP BY matchType, matchKey
      HAVING COUNT(DISTINCT id) BETWEEN 2 AND ${maxGroupSize}
      LIMIT ${maxPairs * 2}`.execute(getDb());

    const pairs = new Map<string, { personId1: string; personId2: string; matchedOn: string[] }>();
    for (const row of result.rows) {
      const ids = row.ids.split(",");
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = ids[i] + "|" + ids[j];
          const pair = pairs.get(key);
          if (!pair) {
            if (pairs.size < maxPairs) pairs.set(key, { personId1: ids[i], personId2: ids[j], matchedOn: [row.matchType] });
          } else if (!pair.matchedOn.includes(row.matchType)) pair.matchedOn.push(row.matchType);
        }
      }
    }
    return Array.from(pairs.values());
  }

  // QR guest sign-up: the one live person with the same first name and the same email or phone.
  // Two or more matches (or none) return null so the caller creates a new person instead of guessing.
  public async findGuestMatch(churchId: string, params: { firstName: string; email?: string; phone?: string }) {
    const firstName = params.firstName?.trim().toLowerCase();
    const email = params.email?.trim().toLowerCase();
    const phoneDigits = (params.phone || "").replace(/\D/g, "");
    if (!firstName || (!email && !phoneDigits)) return null;

    const rows = await getDb().selectFrom("people").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where(sql`LOWER(TRIM(FirstName))`, "=", firstName)
      .where((eb) => {
        const clauses = [];
        if (email) clauses.push(eb(sql`LOWER(email)`, "=", email));
        if (phoneDigits) {
          clauses.push(eb(this.phoneDigitsSql("HomePhone"), "=", phoneDigits));
          clauses.push(eb(this.phoneDigitsSql("WorkPhone"), "=", phoneDigits));
          clauses.push(eb(this.phoneDigitsSql("MobilePhone"), "=", phoneDigits));
        }
        return eb.or(clauses);
      })
      .limit(2)
      .execute();
    return rows.length === 1 ? rows[0] : null;
  }

  public async loadAttendees(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, categoryName: string, groupId: string, startDate: Date, endDate: Date) {
    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`p.churchId = ${churchId} AND v.visitDate BETWEEN ${startDate} AND ${endDate}`);

    if (!UniqueIdHelper.isMissing(campusId)) conditions.push(sql`ser.campusId=${campusId}`);
    if (!UniqueIdHelper.isMissing(serviceId)) conditions.push(sql`ser.id=${serviceId}`);
    if (!UniqueIdHelper.isMissing(serviceTimeId)) conditions.push(sql`st.id=${serviceTimeId}`);
    if (categoryName !== "") conditions.push(sql`g.categoryName=${categoryName}`);
    if (!UniqueIdHelper.isMissing(groupId)) conditions.push(sql`g.id=${groupId}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const result = await sql<AttendeeRow>`SELECT p.Id, p.churchId, p.displayName, p.firstName, p.lastName, p.photoUpdated FROM visitSessions vs INNER JOIN visits v ON v.id = vs.visitId INNER JOIN sessions s ON s.id = vs.sessionId INNER JOIN people p ON p.id = v.personId INNER JOIN \`groups\` g ON g.id = s.groupId LEFT OUTER JOIN serviceTimes st ON st.id = s.serviceTimeId LEFT OUTER JOIN services ser ON ser.id = st.serviceId WHERE ${whereClause} GROUP BY p.id, p.displayName, p.firstName, p.lastName, p.photoUpdated ORDER BY p.lastName, p.firstName`.execute(getDb());
    return result.rows;
  }

  public async loadDemographics(churchId: string) {
    const db = getDb();

    const countByColumn = async (column: "gender" | "membershipStatus" | "maritalStatus") => {
      const bucket = sql<string>`COALESCE(NULLIF(TRIM(${sql.ref(column)}), ''), 'Unassigned')`;
      const rows = await db.selectFrom("people")
        .select((eb) => [bucket.as("name"), eb.fn.countAll<number>().as("count")])
        .where("churchId", "=", churchId)
        .where("removed", "=", false)
        .groupBy(bucket)
        .orderBy(sql`COUNT(*)`, "desc")
        .execute();
      return rows.map((r) => ({ name: r.name as string, count: Number(r.count) }));
    };

    const [gender, membershipStatus, maritalStatus] = await Promise.all([countByColumn("gender"), countByColumn("membershipStatus"), countByColumn("maritalStatus")]);

    const ageRows = await sql<AgeGenderCountRow>`SELECT
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
    ageRows.rows.forEach((r) => {
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
    const campus = campusRows.rows.map((r) => ({ name: String(r.name), id: r.id || "", count: Number(r.count) }));

    const total = gender.reduce((sum, r) => sum + r.count, 0);

    return { total, ageGroups: order.map((g) => ageMap[g]), membershipStatus, gender, maritalStatus, campus };
  }

  protected rowToModel(row: PersonRow): Person {
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
      dateAdded: row.dateAdded ? new Date(row.dateAdded) : undefined,
      id: row.id,
      churchId: row.churchId,
      importKey: row.importKey,
      optedOut: row.optedOut,
      smsOptedOut: row.smsOptedOut,
      conversationId: row.conversationId
    };
    if (result.photo === undefined) result.photo = PersonHelper.getPhotoPath(row.churchId, result);
    return result;
  }

  public convertToModel(_churchId: string, data: PersonRow) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: PersonRow[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }

  public convertToModelWithPermissions(_churchId: string, data: PersonRow, canEdit: boolean) {
    const result = this.rowToModel(data);
    if (!canEdit) delete result.conversationId;
    return result;
  }

  public convertAllToModelWithPermissions(churchId: string, data: PersonRow[], canEdit: boolean) {
    return CollectionHelper.convertAll<Person>(data, (d: PersonRow) => this.convertToModelWithPermissions(churchId, d, canEdit));
  }

  public convertAllToBasicModel(churchId: string, data: PersonRow[]) {
    return CollectionHelper.convertAll<Person>(data, (d: PersonRow) => this.convertToBasicModel(churchId, d));
  }

  public convertToBasicModel(churchId: string, data: PersonRow) {
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

  public convertAllToCheckinModel(churchId: string, data: PersonRow[]) {
    return CollectionHelper.convertAll<Person>(data, (d: PersonRow) => this.convertToCheckinModel(churchId, d));
  }

  // What a check-in kiosk needs to find a family, pick eligible groups and print labels. Nothing else from the record.
  public convertToCheckinModel(churchId: string, data: PersonRow) {
    const result: Person = {
      name: { display: data.displayName, first: data.firstName, last: data.lastName, nick: data.nickName },
      contactInfo: {},
      photo: data.photo,
      photoUpdated: data.photoUpdated ? new Date(data.photoUpdated) : undefined,
      membershipStatus: data.membershipStatus,
      householdId: data.householdId,
      householdRole: data.householdRole,
      birthDate: data.birthDate,
      grade: data.grade,
      nametagNotes: data.nametagNotes,
      id: data.id
    };
    if (result.photo === undefined) result.photo = PersonHelper.getPhotoPath(churchId, result);
    return result;
  }

  public convertToPreferenceModel(churchId: string, data: Person) {
    const result: Person = {
      name: { display: data.name!.display },
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
