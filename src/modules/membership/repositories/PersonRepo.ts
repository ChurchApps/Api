import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { injectable } from "inversify";
import { DateHelper, PersonHelper, UniqueIdHelper } from "../helpers";
import { Person } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { CollectionHelper } from "../../../shared/helpers";

@injectable()
export class PersonRepo extends ConfiguredRepo<Person> {
  protected get repoConfig(): RepoConfig<Person> {
    return {
      tableName: "people",
      hasSoftDelete: true,
      removedColumn: "removed",
      columns: [
        "displayName",
        "firstName",
        "middleName",
        "lastName",
        "nickName",
        "prefix",
        "suffix",
        "birthDate",
        "gender",
        "maritalStatus",
        "anniversary",
        "membershipStatus",
        "homePhone",
        "mobilePhone",
        "workPhone",
        "email",
        "nametagNotes",
        "address1",
        "address2",
        "city",
        "state",
        "zip",
        "photoUpdated",
        "householdId",
        "householdRole",
        "conversationId",
        "optedOut"
      ],
      insertLiterals: { removed: "0" }
    };
  }
  public save(person: Person) {
    person.name.display = PersonHelper.getDisplayNameFromPerson(person);
    return super.save(person);
  }

  protected async create(person: Person): Promise<Person> {
    // Prepare complex fields before calling super.create()
    this.prepareDateFields(person);
    this.prepareContactFields(person);
    return super.create(person);
  }

  private prepareDateFields(person: Person) {
    (person as any).birthDate = DateHelper.toMysqlDate(person.birthDate);
    (person as any).anniversary = DateHelper.toMysqlDate(person.anniversary);
    (person as any).photoUpdated = DateHelper.toMysqlDate(person.photoUpdated);
  }

  private prepareContactFields(person: Person) {
    // Map contact info fields to flat structure
    (person as any).homePhone = person.contactInfo?.homePhone;
    (person as any).mobilePhone = person.contactInfo?.mobilePhone;
    (person as any).workPhone = person.contactInfo?.workPhone;
    (person as any).email = person.contactInfo?.email;
    (person as any).address1 = person.contactInfo?.address1;
    (person as any).address2 = person.contactInfo?.address2;
    (person as any).city = person.contactInfo?.city;
    (person as any).state = person.contactInfo?.state;
    (person as any).zip = person.contactInfo?.zip;

    // Map name fields to flat structure
    (person as any).displayName = person.name?.display;
    (person as any).firstName = person.name?.first;
    (person as any).middleName = person.name?.middle;
    (person as any).lastName = person.name?.last;
    (person as any).nickName = person.name?.nick;
    (person as any).prefix = person.name?.prefix;
    (person as any).suffix = person.name?.suffix;
  }

  public updateOptedOut(personId: string, optedOut: boolean) {
    const sql = "UPDATE people SET optedOut=? WHERE id=?";
    const params = [optedOut, personId];
    return TypedDB.query(sql, params);
  }

  protected async update(person: Person): Promise<Person> {
    // Prepare complex fields before calling super.update()
    this.prepareDateFields(person);
    this.prepareContactFields(person);
    return super.update(person);
  }

  public async updateHousehold(person: Person) {
    const sql = "UPDATE people SET householdId=?, householdRole=? WHERE id=? and churchId=?";
    const params = [person.householdId, person.householdRole, person.id, person.churchId];
    await TypedDB.query(sql, params);
    return person;
  }

  public restore(churchId: string, id: string) {
    return TypedDB.query("UPDATE people SET removed=0 WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM people WHERE id IN (?) AND churchId=?;", [ids, churchId]);
  }

  public loadByIdsOnly(ids: string[]) {
    return TypedDB.query("SELECT * FROM people WHERE id IN (?);", [ids]);
  }

  public loadMembers(churchId: string) {
    return TypedDB.query("SELECT * FROM people WHERE churchId=? AND removed=0 and membershipStatus in ('Member', 'Staff');", [churchId]);
  }

  public loadRecent(churchId: string, filterOptedOut?: boolean) {
    const filter = filterOptedOut ? " AND (optedOut = FALSE OR optedOut IS NULL)" : "";
    return TypedDB.query("SELECT * FROM (SELECT * FROM people WHERE churchId=? AND removed=0" + filter + " order by id desc limit 25) people ORDER BY lastName, firstName;", [churchId]);
  }

  public loadByHousehold(churchId: string, householdId: string) {
    return TypedDB.query("SELECT * FROM people WHERE churchId=? and householdId=? AND removed=0;", [churchId, householdId]);
  }

  public search(churchId: string, term: string, filterOptedOut?: boolean) {
    const filter = filterOptedOut ? " AND (optedOut = FALSE OR optedOut IS NULL)" : "";
    return TypedDB.query(
      "SELECT * FROM people WHERE churchId=? AND concat(IFNULL(FirstName,''), ' ', IFNULL(MiddleName,''), ' ', IFNULL(NickName,''), ' ', IFNULL(LastName,'')) LIKE ? AND removed=0" +
        filter +
        " LIMIT 100;",
      [churchId, "%" + term.replace(" ", "%") + "%"]
    );
  }

  public searchPhone(churchId: string, phonestring: string) {
    const phoneSearch = "%" + phonestring.replace(/ |-/g, "%") + "%";
    return TypedDB.query(
      "SELECT * FROM people WHERE churchId=? AND (REPLACE(REPLACE(HomePhone,'-',''), ' ', '') LIKE ? OR REPLACE(REPLACE(WorkPhone,'-',''), ' ', '') LIKE ? OR REPLACE(REPLACE(MobilePhone,'-',''), ' ', '') LIKE ?) AND removed=0 LIMIT 100;",
      [churchId, phoneSearch, phoneSearch, phoneSearch]
    );
  }

  public searchEmail(churchId: string, email: string) {
    return TypedDB.query("SELECT * FROM people WHERE churchId=? AND email like ? AND removed=0 LIMIT 100;", [churchId, "%" + email + "%"]);
  }

  public loadAttendees(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, categoryName: string, groupId: string, startDate: Date, endDate: Date) {
    const params = [];
    params.push(churchId);
    params.push(startDate);
    params.push(endDate);

    let sql =
      "SELECT p.Id, p.churchId, p.displayName, p.firstName, p.lastName, p.photoUpdated" +
      " FROM visitSessions vs" +
      " INNER JOIN visits v on v.id = vs.visitId" +
      " INNER JOIN sessions s on s.id = vs.sessionId" +
      " INNER JOIN people p on p.id = v.personId" +
      " INNER JOIN `groups` g on g.id = s.groupId" +
      " LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId" +
      " LEFT OUTER JOIN services ser on ser.id = st.serviceId" +
      " WHERE p.churchId = ? AND v.visitDate BETWEEN ? AND ?";

    if (!UniqueIdHelper.isMissing(campusId)) {
      sql += " AND ser.campusId=?";
      params.push(campusId);
    }
    if (!UniqueIdHelper.isMissing(serviceId)) {
      sql += " AND ser.id=?";
      params.push(serviceId);
    }
    if (!UniqueIdHelper.isMissing(serviceTimeId)) {
      sql += " AND st.id=?";
      params.push(serviceTimeId);
    }
    if (categoryName !== "") {
      sql += " AND g.categoryName=?";
      params.push(categoryName);
    }
    if (!UniqueIdHelper.isMissing(groupId)) {
      sql += " AND g.id=?";
      params.push(groupId);
    }
    sql += " GROUP BY p.id, p.displayName, p.firstName, p.lastName, p.photoUpdated";
    sql += " ORDER BY p.lastName, p.firstName";
    return TypedDB.query(sql, params);
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
      membershipStatus: row.membershipStatus,
      photoUpdated: row.photoUpdated,
      id: row.id,
      churchId: row.churchId,
      importKey: row.importKey,
      optedOut: row.optedOut,
      conversationId: row.conversationId
    };
    if (result.photo === undefined) result.photo = PersonHelper.getPhotoPath(row.churchId, result);
    return result;
  }

  public convertToModelWithPermissions(churchId: string, data: any, canEdit: boolean) {
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
      photoUpdated: data.photoUpdated,
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
