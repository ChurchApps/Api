import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { GroupMember } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { PersonHelper } from "../helpers";
import { UniqueIdHelper } from "../helpers";

@injectable()
export class GroupMemberRepository {
  public save(groupMember: GroupMember) {
    return groupMember.id ? this.update(groupMember) : this.create(groupMember);
  }

  private async create(groupMember: GroupMember) {
    groupMember.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO groupMembers (id, churchId, groupId, personId, joinDate, leader) VALUES (?, ?, ?, ?, NOW(), leader);";
    const params = [groupMember.id, groupMember.churchId, groupMember.groupId, groupMember.personId, groupMember.leader];
    await TypedDB.query(sql, params);
    return groupMember;
  }

  private async update(groupMember: GroupMember) {
    const sql = "UPDATE groupMembers SET  groupId=?, personId=?, leader=? WHERE id=? and churchId=?";
    const params = [groupMember.groupId, groupMember.personId, groupMember.leader, groupMember.id, groupMember.churchId];
    await TypedDB.query(sql, params);
    return groupMember;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM groupMembers WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM groupMembers WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM groupMembers WHERE churchId=?;", [churchId]);
  }

  public loadForGroup(churchId: string, groupId: string) {
    const sql =
      "SELECT gm.*, p.photoUpdated, p.displayName, p.email" +
      " FROM groupMembers gm" +
      " INNER JOIN people p on p.id=gm.personId" +
      " WHERE gm.churchId=? AND gm.groupId=?" +
      " ORDER BY gm.leader desc, p.lastName, p.firstName;";
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

  public convertToModel(churchId: string, data: any) {
    const result: GroupMember = {
      id: data.id,
      groupId: data.groupId,
      personId: data.personId,
      joinDate: data.joinDate,
      leader: data.leader
    };
    if (data.displayName !== undefined) {
      result.person = {
        id: result.personId,
        photoUpdated: data.photoUpdated,
        name: { display: data.displayName },
        contactInfo: { email: data.email }
      };
      result.person.photo = PersonHelper.getPhotoPath(churchId, result.person);
    }
    if (data.groupName !== undefined) result.group = { id: result.groupId, name: data.groupName };

    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<GroupMember>(data, (d: any) => this.convertToModel(churchId, d));
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
