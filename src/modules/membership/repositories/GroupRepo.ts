import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Group } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class GroupRepo extends ConfiguredRepo<Group> {
  protected get repoConfig(): RepoConfig<Group> {
    return {
      tableName: "groups",
      hasSoftDelete: true,
      removedColumn: "removed",
      columns: ["categoryName", "name", "trackAttendance", "parentPickup", "printNametag", "about", "photoUrl", "tags", "meetingTime", "meetingLocation", "labels", "slug"],
      insertLiterals: { removed: "0" }
    };
  }
  public save(group: Group) {
    this.convertFromModel(group);
    return super.save(group);
  }

  protected async create(group: Group): Promise<Group> {
    this.convertFromModel(group);
    return super.create(group);
  }

  protected async update(group: Group): Promise<Group> {
    this.convertFromModel(group);
    return super.update(group);
  }

  public deleteByIds(churchId: string, ids: string[]) {
    return TypedDB.query("UPDATE `groups` SET removed=1 WHERE id IN (?) AND churchId=?;", [ids, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM `groups` WHERE id=? AND churchId=? AND removed=0;", [id, churchId]);
  }

  public loadPublicSlug(churchId: string, slug: string) {
    const sql = "SELECT * FROM `groups`" + " WHERE churchId = ? AND slug = ? AND removed=0";
    return TypedDB.queryOne(sql, [churchId, slug]);
  }

  public loadByTag(churchId: string, tag: string) {
    return TypedDB.query(
      "SELECT *, (SELECT COUNT(*) FROM groupMembers gm WHERE gm.groupId=g.id) AS memberCount FROM `groups` g WHERE churchId=? AND removed=0 AND tags like ? ORDER by categoryName, name;",
      [churchId, "%" + tag + "%"]
    );
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT *, (SELECT COUNT(*) FROM groupMembers gm WHERE gm.groupId=g.id) AS memberCount FROM `groups` g WHERE churchId=? AND removed=0 ORDER by categoryName, name;", [
      churchId
    ]);
  }

  public loadForPerson(personId: string) {
    const sql = "SELECT distinct g.*" + " FROM groupMembers gm" + " INNER JOIN `groups` g on g.id=gm.groupId" + " WHERE personId=? and g.removed=0 and g.tags like '%standard%'" + " ORDER BY name";
    return TypedDB.query(sql, [personId]);
  }

  public async loadByIds(churchId: string, ids: string[]) {
    const sql = "SELECT * FROM `groups` WHERE churchId=? AND id IN (?) ORDER by name";
    const result = await TypedDB.query(sql, [churchId, ids]);
    return result;
  }

  public publicLabel(churchId: string, label: string) {
    const sql = "SELECT * FROM `groups`" + " WHERE churchId = ? AND labels LIKE ? AND removed=0" + " ORDER BY name";
    return TypedDB.query(sql, [churchId, "%" + label + "%"]);
  }

  public search(churchId: string, campusId: string, serviceId: string, serviceTimeId: string) {
    const sql =
      "SELECT g.id, g.categoryName, g.name" +
      " FROM `groups` g" +
      " LEFT OUTER JOIN groupServiceTimes gst on gst.groupId=g.id" +
      " LEFT OUTER JOIN serviceTimes st on st.id=gst.serviceTimeId" +
      " LEFT OUTER JOIN services s on s.id=st.serviceId" +
      " WHERE g.churchId = ? AND (?=0 OR gst.serviceTimeId=?) AND (?=0 OR st.serviceId=?) AND (? = 0 OR s.campusId = ?) and g.removed=0" +
      " GROUP BY g.id, g.categoryName, g.name ORDER BY g.name";
    return TypedDB.query(sql, [churchId, serviceTimeId, serviceTimeId, serviceId, serviceId, campusId, campusId]);
  }

  public convertFromModel(group: Group) {
    group.labels = null;
    if (group.labelArray?.length > 0) group.labels = group.labelArray.join(",");
  }

  protected rowToModel(row: any): Group {
    const result: Group = {
      id: row.id,
      churchId: row.churchId,
      categoryName: row.categoryName,
      name: row.name,
      trackAttendance: row.trackAttendance,
      parentPickup: row.parentPickup,
      printNametag: row.printNametag,
      memberCount: row.memberCount,
      about: row.about,
      photoUrl: row.photoUrl,
      tags: row.tags,
      meetingTime: row.meetingTime,
      meetingLocation: row.meetingLocation,
      labelArray: [],
      slug: row.slug
    };
    row.labels?.split(",").forEach((label: string) => result.labelArray.push(label.trim()));
    return result;
  }
}
