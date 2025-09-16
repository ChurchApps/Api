import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { RoleMember } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";
import { injectable } from "inversify";

@injectable()
export class RoleMemberRepository extends ConfiguredRepository<RoleMember> {
  protected get repoConfig(): RepoConfig<RoleMember> {
    return {
      tableName: "roleMembers",
      hasSoftDelete: false,
      insertColumns: ["roleId", "userId", "addedBy"],
      updateColumns: ["roleId", "userId", "dateAdded", "addedBy"],
      insertLiterals: { dateAdded: "NOW()" }
    };
  }

  public loadByRoleId(roleId: string, churchId: string): Promise<RoleMember[]> {
    return TypedDB.query(
      "SELECT rm.*, uc.personId FROM roleMembers rm LEFT JOIN userChurches uc ON rm.userId=uc.userId AND rm.churchId=uc.churchId WHERE roleId=? AND rm.churchId=? ORDER BY rm.dateAdded;",
      [roleId, churchId]
    ) as Promise<RoleMember[]>;
  }

  public delete(id: string, churchId: string): Promise<RoleMember> {
    return TypedDB.query("DELETE FROM roleMembers WHERE id=? AND churchId=?", [id, churchId]);
  }

  public loadById(id: string, churchId: string): Promise<RoleMember> {
    return this.loadOne(churchId, id) as Promise<RoleMember>;
  }

  public deleteForRole(churchId: string, roleId: string) {
    const sql = "DELETE FROM roleMembers WHERE churchId=? AND roleId=?";
    const params = [churchId, roleId];
    return TypedDB.query(sql, params);
  }

  public deleteUser(userId: string) {
    const query = "DELETE FROM roleMembers WHERE userId=?";
    return TypedDB.query(query, [userId]);
  }

  public deleteSelf(churchId: string, userId: string) {
    const query = "DELETE FROM roleMembers WHERE churchId=? AND userId=?;";
    return TypedDB.query(query, [churchId, userId]);
  }
}
