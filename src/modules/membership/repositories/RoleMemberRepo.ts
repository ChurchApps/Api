import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { roleMembers } from "../../../db/schema/membership.js";
import { RoleMember } from "../models/index.js";

@injectable()
export class RoleMemberRepo extends DrizzleRepo<typeof roleMembers> {
  protected readonly table = roleMembers;
  protected readonly moduleName = "membership";

  public async save(model: RoleMember) {
    if (model.id) {
      const { id: _id, churchId: _churchId, ...setData } = model as any;
      await this.db.update(roleMembers).set(setData)
        .where(and(eq(roleMembers.id, model.id), eq(roleMembers.churchId, model.churchId!)));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.db.insert(roleMembers).values({ ...model, dateAdded: new Date() } as any);
    }
    return model;
  }

  public loadByRoleId(roleId: string, churchId: string): Promise<RoleMember[]> {
    return this.executeRows(sql`
      SELECT rm.*, uc.personId FROM roleMembers rm
      LEFT JOIN userChurches uc ON rm.userId=uc.userId AND rm.churchId=uc.churchId
      WHERE roleId=${roleId} AND rm.churchId=${churchId}
      ORDER BY rm.dateAdded
    `) as Promise<RoleMember[]>;
  }

  public loadById(id: string, churchId: string): Promise<RoleMember> {
    return this.loadOne(churchId, id) as Promise<RoleMember>;
  }

  public deleteForRole(churchId: string, roleId: string) {
    return this.db.delete(roleMembers).where(and(eq(roleMembers.churchId, churchId), eq(roleMembers.roleId, roleId)));
  }

  public deleteUser(userId: string) {
    return this.db.delete(roleMembers).where(eq(roleMembers.userId, userId));
  }

  public deleteSelf(churchId: string, userId: string) {
    return this.db.delete(roleMembers).where(and(eq(roleMembers.churchId, churchId), eq(roleMembers.userId, userId)));
  }
}
