import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { UserChurch } from "../models/index.js";

@injectable()
export class UserChurchRepo {
  public async save(model: UserChurch) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(userChurch: UserChurch): Promise<UserChurch> {
    userChurch.id = UniqueIdHelper.shortId();
    userChurch.lastAccessed = new Date();
    await getDb().insertInto("userChurches").values({
      id: userChurch.id,
      churchId: userChurch.churchId,
      userId: userChurch.userId,
      personId: userChurch.personId,
      lastAccessed: userChurch.lastAccessed
    }).execute();
    return userChurch;
  }

  private async update(userChurch: UserChurch): Promise<UserChurch> {
    await getDb().updateTable("userChurches").set({
      userId: userChurch.userId,
      personId: userChurch.personId,
      lastAccessed: userChurch.lastAccessed
    }).where("id", "=", userChurch.id).where("churchId", "=", userChurch.churchId).execute();
    return userChurch;
  }

  public async delete(userId: string): Promise<any> {
    await getDb().deleteFrom("userChurches").where("userId", "=", userId).execute();
  }

  public async deleteRecord(userId: string, churchId: string, personId: string) {
    await getDb().deleteFrom("userChurches")
      .where("userId", "=", userId)
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
  }

  public async load(userChurchId: string): Promise<UserChurch> {
    return (await getDb().selectFrom("userChurches").selectAll().where("id", "=", userChurchId).executeTakeFirst()) ?? null;
  }

  public async loadByUserId(userId: string, churchId: string) {
    return (await getDb().selectFrom("userChurches").selectAll()
      .where("userId", "=", userId)
      .where("churchId", "=", churchId)
      .executeTakeFirst()) ?? null;
  }

  public async loadByPersonId(personId: string, churchId: string): Promise<any> {
    return (await getDb().selectFrom("userChurches as uc")
      .innerJoin("users as u", "u.id", "uc.userId")
      .selectAll("uc")
      .select("u.email")
      .where("uc.personId", "=", personId)
      .where("uc.churchId", "=", churchId)
      .executeTakeFirst()) ?? null;
  }

  public async loadForUser(userId: string): Promise<any[]> {
    const rows = await getDb().selectFrom("userChurches as uc")
      .innerJoin("churches as c", (join) => join.onRef("c.id", "=", "uc.churchId").on("c.archivedDate", "is", null))
      .leftJoin("people as p", (join) => join.onRef("p.id", "=", "uc.personId").onRef("p.churchId", "=", "uc.churchId").on((eb) => eb.or([eb("p.removed", "=", 0 as any), eb("p.removed", "is", null)])))
      .selectAll("uc")
      .select(["c.id as churchId", "c.name as churchName", "c.subDomain", "p.id as activePersonId", "p.firstName", "p.lastName", "p.displayName"])
      .where("uc.userId", "=", userId)
      .execute() as any[];
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

  public async loadAll(churchId: string) {
    return getDb().selectFrom("userChurches").selectAll().where("churchId", "=", churchId).execute();
  }

  public saveAll(models: UserChurch[]) {
    const promises: Promise<UserChurch>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: UserChurch): Promise<UserChurch> {
    return this.create(model);
  }

  protected rowToModel(row: any): UserChurch {
    return {
      id: row.id,
      userId: row.userId,
      churchId: row.churchId,
      personId: row.personId,
      lastAccessed: row.lastAccessed
    };
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
