import { injectable } from "inversify";
import { eq, sql, inArray, isNull, like, asc, and, count } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { churches } from "../../../db/schema/membership.js";
import { Church, Api, LoginUserChurch } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class ChurchRepo extends GlobalDrizzleRepo<typeof churches> {
  protected readonly table = churches;
  protected readonly moduleName = "membership";

  public async save(church: Church) {
    if (church.id) {
      return this.update(church);
    } else {
      return this.create(church);
    }
  }

  protected async create(church: Church): Promise<Church> {
    church.id = UniqueIdHelper.shortId();
    const data: any = { ...church, registrationDate: new Date() };
    await this.db.insert(churches).values(data);
    return church;
  }

  protected async update(church: Church): Promise<Church> {
    const data: any = {
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
    };
    await this.db.update(churches).set(data).where(eq(churches.id, church.id!));
    return church;
  }

  public async loadCount() {
    const rows = await this.db.select({ count: count() }).from(churches);
    return rows[0]?.count || 0;
  }

  public loadAll() {
    return this.db.select().from(churches)
      .where(isNull(churches.archivedDate))
      .orderBy(asc(churches.name));
  }

  public search(name: string, includeArchived: boolean) {
    const searchTerm = "%" + name.replace(" ", "%") + "%";
    const limitVal = name ? 50 : 10;
    if (includeArchived) {
      return this.db.select().from(churches)
        .where(like(churches.name, searchTerm))
        .orderBy(asc(churches.name))
        .limit(limitVal);
    } else {
      return this.db.select().from(churches)
        .where(and(like(churches.name, searchTerm), isNull(churches.archivedDate)))
        .orderBy(asc(churches.name))
        .limit(limitVal);
    }
  }

  public loadContainingSubDomain(subDomain: string) {
    return this.db.select().from(churches)
      .where(and(like(churches.subDomain, subDomain + "%"), isNull(churches.archivedDate)));
  }

  public loadBySubDomain(subDomain: string) {
    return this.db.select().from(churches)
      .where(and(eq(churches.subDomain, subDomain), isNull(churches.archivedDate)))
      .then(r => r[0] ?? null);
  }

  public loadById(id: string) {
    return this.db.select().from(churches).where(eq(churches.id, id)).then(r => r[0] ?? null);
  }

  public loadByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(churches).where(inArray(churches.id, ids)).orderBy(asc(churches.name));
  }

  public async loadForUser(userId: string) {
    let rows: any[];
    if (getDialect() === "postgres") {
      rows = await this.executeRows(sql`
        SELECT c.*, p.id AS "personId", p."membershipStatus" FROM "userChurches" uc
        INNER JOIN churches c ON c.id = uc."churchId" AND c."archivedDate" IS NULL
        LEFT JOIN people p ON p.id = uc."personId" AND (p.removed = false OR p.removed IS NULL)
        WHERE uc."userId" = ${userId}
      `);
    } else {
      rows = await this.executeRows(sql`
        SELECT c.*, p.id AS personId, p.membershipStatus FROM userChurches uc
        INNER JOIN churches c ON c.id = uc.churchId AND c.archivedDate IS NULL
        LEFT JOIN people p ON p.id = uc.personId AND (p.removed = 0 OR p.removed IS NULL)
        WHERE uc.userId = ${userId}
      `);
    }
    const result: LoginUserChurch[] = [];
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
      result.push(addChurch);
    });
    return result;
  }

  public async getAbandoned(noMonths = 6) {
    const cutoff = DateHelper.monthsFromNow(-noMonths);
    if (getDialect() === "postgres") {
      return this.executeRows(sql`
        SELECT "churchId" FROM (
          SELECT "churchId", MAX("lastAccessed") AS "lastAccessed" FROM "userChurches" GROUP BY "churchId"
        ) "groupedChurches" WHERE "lastAccessed" <= ${cutoff}
      `);
    }
    return this.executeRows(sql`
      SELECT churchId FROM (
        SELECT churchId, MAX(lastAccessed) lastAccessed FROM userChurches GROUP BY churchId
      ) groupedChurches WHERE lastAccessed <= ${cutoff}
    `);
  }

  public async deleteAbandoned(noMonths = 7) {
    if (getDialect() === "postgres") {
      return (this.db as any).execute(sql`
        DELETE FROM churches WHERE id IN (
          SELECT c.id FROM churches c LEFT JOIN (
            SELECT "churchId", MAX("lastAccessed") AS "lastAccessed" FROM "userChurches" GROUP BY "churchId"
          ) gc ON c.id = gc."churchId"
          WHERE gc."lastAccessed" <= NOW() - INTERVAL '${sql.raw(String(noMonths))} months'
        )
      `);
    }
    return (this.db as any).execute(sql`
      DELETE churches FROM churches LEFT JOIN (
        SELECT churchId, MAX(lastAccessed) lastAccessed FROM userChurches GROUP BY churchId
      ) groupedChurches ON churches.id = groupedChurches.churchId
      WHERE groupedChurches.lastAccessed <= DATE_SUB(NOW(), INTERVAL ${noMonths} MONTH)
    `);
  }

  public convertToModel(_churchId: string, data: any): Church {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.rowToModel(d));
  }

  private rowToModel(row: any): Church {
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
}
