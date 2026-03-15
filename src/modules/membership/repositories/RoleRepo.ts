import { injectable } from "inversify";
import { eq, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { roles } from "../../../db/schema/membership.js";
import { Role } from "../models/index.js";

@injectable()
export class RoleRepo extends DrizzleRepo<typeof roles> {
  protected readonly table = roles;
  protected readonly moduleName = "membership";


  public loadByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(roles).where(inArray(roles.id, ids));
  }

  public loadAllGlobal() {
    return this.db.select().from(roles);
  }

  public loadByChurchId(id: string) {
    return this.db.select().from(roles).where(eq(roles.churchId, id));
  }

  public loadById(churchId: string, id: string): Promise<Role> {
    return this.loadOne(churchId, id) as Promise<Role>;
  }
}
