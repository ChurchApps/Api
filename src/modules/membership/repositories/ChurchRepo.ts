import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Church, Api, LoginUserChurch } from "../models/index.js";

@injectable()
export class ChurchRepo {
  public async save(model: Church) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(church: Church): Promise<Church> {
    church.id = UniqueIdHelper.shortId();
    await getDb().insertInto("churches").values({
      id: church.id,
      name: church.name,
      subDomain: church.subDomain,
      registrationDate: sql`NOW()` as any,
      address1: church.address1,
      address2: church.address2,
      city: church.city,
      state: church.state,
      zip: church.zip,
      country: church.country,
      archivedDate: church.archivedDate,
      latitude: church.latitude,
      longitude: church.longitude
    }).execute();
    return church;
  }

  private async update(church: Church): Promise<Church> {
    await getDb().updateTable("churches").set({
      name: church.name,
      subDomain: church.subDomain,
      address1: church.address1,
      address2: church.address2,
      city: church.city,
      state: church.state,
      zip: church.zip,
      country: church.country,
      archivedDate: church.archivedDate,
      latitude: church.latitude,
      longitude: church.longitude
    }).where("id", "=", church.id).execute();
    return church;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("churches").where("id", "=", id).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("churches").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadCount() {
    const result = (await getDb().selectFrom("churches").select(sql`COUNT(*)`.as("count")).executeTakeFirst()) ?? null;
    return parseInt((result as any)?.count || "0", 10);
  }

  public async loadAll() {
    return getDb().selectFrom("churches").selectAll().where("archivedDate", "is", null).orderBy("name").execute();
  }

  public async search(name: string, includeArchived: boolean) {
    let query = getDb().selectFrom("churches").selectAll()
      .where("name", "like", "%" + name.replace(" ", "%") + "%");
    if (!includeArchived) query = query.where("archivedDate", "is", null);
    query = query.orderBy("name");
    if (name) query = query.limit(50);
    else query = query.limit(10);
    return query.execute();
  }

  public async loadContainingSubDomain(subDomain: string) {
    return getDb().selectFrom("churches").selectAll()
      .where("subDomain", "like", subDomain + "%")
      .where("archivedDate", "is", null)
      .execute();
  }

  public async loadBySubDomain(subDomain: string) {
    return (await getDb().selectFrom("churches").selectAll()
      .where("subDomain", "=", subDomain)
      .where("archivedDate", "is", null)
      .executeTakeFirst()) ?? null;
  }

  public async loadById(id: string) {
    return (await getDb().selectFrom("churches").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByIds(ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("churches").selectAll().where("id", "in", ids).orderBy("name").execute();
  }

  public async loadForUser(userId: string) {
    const result = await sql`SELECT c.*, p.id as personId, p.membershipStatus FROM userChurches uc INNER JOIN churches c ON c.id=uc.churchId AND c.archivedDate IS NULL LEFT JOIN people p ON p.id=uc.personId AND (p.removed=0 OR p.removed IS NULL) WHERE uc.userId=${userId}`.execute(getDb());
    const rows = result.rows as any[];
    const loginUserChurches: LoginUserChurch[] = [];
    rows.forEach((row: any) => {
      const apis: Api[] = [];
      const addChurch = {
        church: {
          id: row.id,
          name: row.name,
          subDomain: row.subDomain,
          archivedDate: row.archivedDate,
          address1: row.address1,
          address2: row.address2,
          city: row.city,
          state: row.state,
          zip: row.zip,
          country: row.country
        },
        person: {
          id: row.personId,
          membershipStatus: row.membershipStatus
        },
        apis
      };
      loginUserChurches.push(addChurch);
    });
    return loginUserChurches;
  }

  public async getAbandoned(noMonths = 6) {
    const result = await sql`SELECT churchId FROM (SELECT churchId, MAX(lastAccessed) lastAccessed FROM userChurches GROUP BY churchId) groupedChurches WHERE lastAccessed <= DATE_SUB(NOW(), INTERVAL ${noMonths} MONTH)`.execute(getDb());
    return result.rows;
  }

  public async deleteAbandoned(noMonths = 7) {
    await sql`DELETE churches FROM churches LEFT JOIN (SELECT churchId, MAX(lastAccessed) lastAccessed FROM userChurches GROUP BY churchId) groupedChurches ON churches.id = groupedChurches.churchId WHERE groupedChurches.lastAccessed <= DATE_SUB(NOW(), INTERVAL ${noMonths} MONTH)`.execute(getDb());
  }

  protected rowToModel(row: any): Church {
    return {
      id: row.id,
      name: row.name,
      address1: row.address1,
      address2: row.address2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      country: row.country,
      registrationDate: row.registrationDate,
      subDomain: row.subDomain,
      archivedDate: row.archivedDate,
      latitude: row.latitude,
      longitude: row.longitude
    };
  }

  public convertToModel(data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => this.rowToModel(d));
  }
}
