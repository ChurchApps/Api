import { injectable } from "inversify";
import { eq, and, isNull, or } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { userChurches, users, churches, people } from "../../../db/schema/membership.js";
import { UserChurch } from "../models/index.js";

@injectable()
export class UserChurchRepo extends DrizzleRepo<typeof userChurches> {
  protected readonly table = userChurches;
  protected readonly moduleName = "membership";

  public async save(model: UserChurch) {
    if (model.id) {
      const { id: _id, ...setData } = model as any;
      await this.db.update(userChurches).set(setData).where(eq(userChurches.id, model.id));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.lastAccessed = new Date();
      await this.db.insert(userChurches).values(model as any);
    }
    return model;
  }

  public async delete(userId: string): Promise<any> {
    return this.db.delete(userChurches).where(eq(userChurches.userId, userId));
  }

  public deleteRecord(userId: string, churchId: string, personId: string) {
    return this.db.delete(userChurches)
      .where(and(eq(userChurches.userId, userId), eq(userChurches.churchId, churchId), eq(userChurches.personId, personId)));
  }

  // Override base class load to support single-arg calls (global lookup by id)
  public load(churchIdOrId: string, id?: string): Promise<any> {
    if (id !== undefined) {
      return this.loadOne(churchIdOrId, id);
    }
    return this.db.select().from(userChurches).where(eq(userChurches.id, churchIdOrId)).then(r => (r[0] as UserChurch) ?? null);
  }

  public loadByUserId(userId: string, churchId: string) {
    return this.db.select().from(userChurches)
      .where(and(eq(userChurches.userId, userId), eq(userChurches.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadByPersonId(personId: string, churchId: string): Promise<any> {
    const rows = await this.db.select({
      id: userChurches.id,
      userId: userChurches.userId,
      churchId: userChurches.churchId,
      personId: userChurches.personId,
      lastAccessed: userChurches.lastAccessed,
      email: users.email
    })
      .from(userChurches)
      .innerJoin(users, eq(users.id, userChurches.userId))
      .where(and(eq(userChurches.personId, personId), eq(userChurches.churchId, churchId)));
    return rows[0] ?? null;
  }

  public async loadForUser(userId: string): Promise<any[]> {
    const rows = await this.db.select({
      id: userChurches.id,
      userId: userChurches.userId,
      churchId: churches.id,
      churchName: churches.name,
      subDomain: churches.subDomain,
      activePersonId: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      displayName: people.displayName
    })
      .from(userChurches)
      .innerJoin(churches, and(eq(churches.id, userChurches.churchId), isNull(churches.archivedDate)))
      .leftJoin(people, and(eq(people.id, userChurches.personId), eq(people.churchId, userChurches.churchId), or(eq(people.removed, false), isNull(people.removed))))
      .where(eq(userChurches.userId, userId));
    return rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      personId: row.activePersonId,
      church: {
        id: row.churchId,
        name: row.churchName,
        subDomain: row.subDomain
      },
      person: row.activePersonId
        ? {
          id: row.activePersonId,
          name: {
            first: row.firstName,
            last: row.lastName,
            display: row.displayName
          }
        }
        : null
    }));
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any) { return Array.isArray(data) ? data : []; }
}
