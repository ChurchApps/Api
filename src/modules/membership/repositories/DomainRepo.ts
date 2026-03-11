import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { domains } from "../../../db/schema/membership.js";

@injectable()
export class DomainRepo extends DrizzleRepo<typeof domains> {
  protected readonly table = domains;
  protected readonly moduleName = "membership";

  public loadByName(domainName: string) {
    return this.db.select().from(domains).where(eq(domains.domainName, domainName)).then(r => r[0] ?? null);
  }

  public loadPairs() {
    return this.executeRows(sql`
      SELECT d.domainName AS host, CONCAT(c.subDomain, '.b1.church:443') AS dial
      FROM domains d
      INNER JOIN churches c ON c.id = d.churchId
      WHERE d.domainName NOT LIKE '%www.%'
    `);
  }

  public loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(domains)
      .where(and(eq(domains.churchId, churchId), inArray(domains.id, ids)));
  }

  public loadUnchecked() {
    return this.executeRows(sql`
      SELECT * FROM domains WHERE lastChecked IS NULL OR lastChecked < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
  }
}
