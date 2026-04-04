import { injectable } from "inversify";
import { sql } from "kysely";
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
    const result = await sql`SELECT uc.*, u.email FROM userChurches uc INNER JOIN users u ON u.id = uc.userId WHERE uc.personId=${personId} AND uc.churchId=${churchId}`.execute(getDb());
    return (result.rows as any[])?.[0] || null;
  }

  public async loadForUser(userId: string): Promise<any[]> {
    const result = await sql`SELECT uc.*, c.id as churchId, c.name as churchName, c.subDomain, p.id as activePersonId, p.firstName, p.lastName, p.displayName FROM userChurches uc INNER JOIN churches c ON c.id = uc.churchId AND c.archivedDate IS NULL LEFT JOIN people p ON p.id = uc.personId AND p.churchId = uc.churchId AND (p.removed = 0 OR p.removed IS NULL) WHERE uc.userId = ${userId}`.execute(getDb());
    const rows = result.rows as any[];
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
