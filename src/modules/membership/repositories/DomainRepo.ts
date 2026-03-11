import { injectable } from "inversify";
import { eq, and, sql, inArray, or, isNull, lt } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { domains, churches } from "../../../db/schema/membership.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { notLike } from "drizzle-orm";

@injectable()
export class DomainRepo extends DrizzleRepo<typeof domains> {
  protected readonly table = domains;
  protected readonly moduleName = "membership";

  public loadByName(domainName: string) {
    return this.db.select().from(domains).where(eq(domains.domainName, domainName)).then(r => r[0] ?? null);
  }

  public loadPairs() {
    return this.db.select({
      host: domains.domainName,
      dial: sql`concat(${churches.subDomain}, '.b1.church:443')`.as("dial")
    })
      .from(domains)
      .innerJoin(churches, eq(churches.id, domains.churchId))
      .where(notLike(domains.domainName, "%www.%"));
  }

  public loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(domains)
      .where(and(eq(domains.churchId, churchId), inArray(domains.id, ids)));
  }

  public loadUnchecked() {
    return this.db.select().from(domains)
      .where(or(isNull(domains.lastChecked), lt(domains.lastChecked, DateHelper.hoursFromNow(-24))));
  }
}
