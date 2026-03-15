import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { memberPermissions } from "../../../db/schema/membership.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class MemberPermissionRepo extends DrizzleRepo<typeof memberPermissions> {
  protected readonly table = memberPermissions;
  protected readonly moduleName = "membership";



  public deleteByMemberId(churchId: string, memberId: string, contentId: string) {
    return this.db.delete(memberPermissions)
      .where(and(eq(memberPermissions.memberId, memberId), eq(memberPermissions.contentId, contentId), eq(memberPermissions.churchId, churchId)));
  }

  public loadMyByForm(churchId: string, formId: string, personId: string) {
    return this.db.select().from(memberPermissions)
      .where(and(
        eq(memberPermissions.churchId, churchId),
        eq(memberPermissions.contentType, "form"),
        eq(memberPermissions.contentId, formId),
        eq(memberPermissions.memberId, personId)
      )).then(r => r[0] ?? null);
  }

  public loadByEmailNotification(churchId: string, contentType: string, contentId: string, emailNotification: boolean) {
    return this.db.select().from(memberPermissions)
      .where(and(
        eq(memberPermissions.churchId, churchId),
        eq(memberPermissions.contentType, contentType),
        eq(memberPermissions.contentId, contentId),
        eq(memberPermissions.emailNotification, emailNotification)
      ));
  }

  public loadFormsByPerson(churchId: string, personId: string) {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT mp.*, p."displayName" AS "personName"
          FROM "memberPermissions" mp
          INNER JOIN people p ON p.id = mp."memberId" AND (p.removed = false OR p.removed IS NULL)
          WHERE mp."churchId" = ${churchId} AND mp."memberId" = ${personId}
          ORDER BY mp.action, mp."emailNotification" DESC`
        : sql`
          SELECT mp.*, p.displayName AS personName
          FROM memberPermissions mp
          INNER JOIN people p ON p.id = mp.memberId AND (p.removed = 0 OR p.removed IS NULL)
          WHERE mp.churchId = ${churchId} AND mp.memberId = ${personId}
          ORDER BY mp.action, mp.emailNotification DESC`
    );
  }

  public loadPeopleByForm(churchId: string, formId: string) {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT mp.*, p."displayName" AS "personName"
          FROM "memberPermissions" mp
          INNER JOIN people p ON p.id = mp."memberId" AND (p.removed = false OR p.removed IS NULL)
          WHERE mp."churchId" = ${churchId} AND mp."contentId" = ${formId}
          ORDER BY mp.action, mp."emailNotification" DESC`
        : sql`
          SELECT mp.*, p.displayName AS personName
          FROM memberPermissions mp
          INNER JOIN people p ON p.id = mp.memberId AND (p.removed = 0 OR p.removed IS NULL)
          WHERE mp.churchId = ${churchId} AND mp.contentId = ${formId}
          ORDER BY mp.action, mp.emailNotification DESC`
    );
  }
}
