import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Domain } from "../models/index.js";

@injectable()
export class DomainRepo {
  public async save(model: Domain) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Domain): Promise<Domain> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("domains").values({
      id: model.id,
      churchId: model.churchId,
      domainName: model.domainName,
      lastChecked: model.lastChecked,
      isStale: model.isStale,
      siteId: model.siteId ?? ""
    }).execute();
    return model;
  }

  private async update(model: Domain): Promise<Domain> {
    // ?? "" is deliberate: Kysely drops undefined keys and B1Admin always resends full rows.
    await getDb().updateTable("domains").set({
      domainName: model.domainName,
      lastChecked: model.lastChecked,
      isStale: model.isStale,
      siteId: model.siteId ?? ""
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("domains").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("domains").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("domains").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByName(domainName: string) {
    const name = (domainName || "").toLowerCase().trim();
    const query = (n: string) => getDb().selectFrom("domains as d")
      .leftJoin("churches as c", "c.id", "d.churchId")
      .leftJoin("sites as s", "s.id", "d.siteId")
      .select([
        "d.id",
        "d.churchId",
        "d.domainName",
        "d.lastChecked",
        "d.isStale",
        "d.siteId",
        sql`COALESCE(NULLIF(s.subDomain,''), c.subDomain)`.as("subDomain")
      ])
      .where("d.domainName", "=", n)
      .executeTakeFirst();
    let row = await query(name);
    // Single retry (not recursion) for a bare-domain fallback when a www.* lookup misses.
    if (!row && name.startsWith("www.")) row = await query(name.substring(4));
    return row ?? null;
  }

  public async loadPairs() {
    return getDb().selectFrom("domains as d")
      .innerJoin("churches as c", "c.id", "d.churchId")
      .leftJoin("sites as s", "s.id", "d.siteId")
      .select(["d.domainName as host", sql`CONCAT(COALESCE(NULLIF(s.subDomain,''), c.subDomain), '.b1.church:443')`.as("dial")])
      .where("d.domainName", "not like", "%www.%")
      .where("d.domainName", "<>", "")
      .where("d.domainName", "not like", "% %")
      .execute();
  }

  public async clearSiteId(churchId: string, siteId: string) {
    await getDb().updateTable("domains").set({ siteId: "" }).where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("domains").selectAll().where("churchId", "=", churchId).where("id", "in", ids).orderBy("domainName").execute();
  }

  public async loadUnchecked() {
    return getDb().selectFrom("domains").selectAll()
      .where((eb) => eb.or([
        eb("lastChecked", "is", null),
        eb("lastChecked", "<", sql`DATE_SUB(NOW(), INTERVAL 24 HOUR)` as any)
      ]))
      .execute();
  }

  public saveAll(models: Domain[]) {
    const promises: Promise<Domain>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Domain): Promise<Domain> {
    return this.create(model);
  }

  protected rowToModel(row: any): Domain {
    return {
      id: row.id,
      churchId: row.churchId,
      domainName: row.domainName,
      lastChecked: row.lastChecked,
      isStale: row.isStale,
      siteId: row.siteId
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
