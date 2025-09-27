import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { GroupMember } from "../models";
import { PersonHelper } from "../helpers";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class GroupMemberRepo extends ConfiguredRepo<GroupMember> {
  protected get repoConfig(): RepoConfig<GroupMember> {
    return {
      tableName: "groupMembers",
      hasSoftDelete: false,
      columns: ["groupId", "personId", "leader"],
      insertLiterals: { joinDate: "NOW()" }
    };
  }

  public loadForGroup(churchId: string, groupId: string) {
    const sql =
      "SELECT gm.*, " +
      "p.photoUpdated, p.displayName, p.email, p.homePhone, p.mobilePhone, p.workPhone, " +
      "p.address1, p.address2, p.city, p.state, p.zip, " +
      "p.householdId, p.householdRole " +
      "FROM groupMembers gm " +
      "INNER JOIN people p on p.id=gm.personId " +
      "WHERE gm.churchId=? AND gm.groupId=? " +
      "ORDER BY gm.leader DESC, p.lastName, p.firstName;";
    return TypedDB.query(sql, [churchId, groupId]);
  }

  public loadLeadersForGroup(churchId: string, groupId: string) {
    const sql =
      "SELECT gm.*, p.photoUpdated, p.displayName" +
      " FROM groupMembers gm" +
      " INNER JOIN people p on p.id=gm.personId" +
      " WHERE gm.churchId=? AND gm.groupId=? and gm.leader=1" +
      " ORDER BY p.lastName, p.firstName;";
    return TypedDB.query(sql, [churchId, groupId]);
  }

  public loadForGroups(churchId: string, groupIds: string[]) {
    const sql =
      "SELECT gm.*, p.photoUpdated, p.displayName, p.email" +
      " FROM groupMembers gm" +
      " INNER JOIN people p on p.id=gm.personId" +
      " WHERE gm.churchId=? AND gm.groupId IN (?)" +
      " ORDER BY gm.leader desc, p.lastName, p.firstName;";
    return TypedDB.query(sql, [churchId, groupIds]);
  }

  public loadForPerson(churchId: string, personId: string) {
    const sql =
      "SELECT gm.*, g.name as groupName" + " FROM groupMembers gm" + " INNER JOIN `groups` g on g.Id=gm.groupId" + " WHERE gm.churchId=? AND gm.personId=? AND g.removed=0" + " ORDER BY g.name;";
    return TypedDB.query(sql, [churchId, personId]);
  }

  public loadForPeople(peopleIds: string[]) {
    const sql = "SELECT gm.*, g.name, g.tags" + " FROM groupMembers gm" + " INNER JOIN `groups` g on g.Id=gm.groupId" + " WHERE gm.personId IN (?);";
    return TypedDB.query(sql, [peopleIds]);
  }

  protected rowToModel(row: any): GroupMember {
    const result: GroupMember = {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      personId: row.personId,
      joinDate: row.joinDate,
      leader: row.leader
    };
    if (row.displayName !== undefined) {
      result.person = {
        id: result.personId,
        photoUpdated: row.photoUpdated,
        name: { display: row.displayName },
        contactInfo: { 
          email: row.email,
          homePhone: row.homePhone,
          mobilePhone: row.mobilePhone,
          workPhone: row.workPhone,
          address1: row.address1,
          address2: row.address2,
          city: row.city,
          state: row.state,
          zip: row.zip
        },
        householdId: row.householdId,
        householdRole: row.householdRole
      };
      result.person.photo = PersonHelper.getPhotoPath(row.churchId, result.person);
    }
    if (row.groupName !== undefined) result.group = { id: result.groupId, name: row.groupName };

    return result;
  }


  public convertAllToBasicModel(churchId: string, data: any[]) {
    const result: GroupMember[] = [];
    data.forEach((d) => result.push(this.convertToBasicModel(churchId, d)));
    return result;
  }

  public convertToBasicModel(churchId: string, data: any) {
    const result = {
      id: data.id,
      groupId: data.groupId,
      personId: data.personId,
      displayName: data.displayName
    };
    return result;
  }
}
