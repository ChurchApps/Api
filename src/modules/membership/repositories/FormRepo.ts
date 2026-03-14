import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { forms } from "../../../db/schema/membership.js";
import { Form } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class FormRepo extends DrizzleRepo<typeof forms> {
  protected readonly table = forms;
  protected readonly moduleName = "membership";
  protected readonly softDelete = true;

  public async save(model: Form) {
    if (model.id) {
      return this.update(model);
    } else {
      return this.create(model);
    }
  }

  private async create(form: Form): Promise<Form> {
    form.id = UniqueIdHelper.shortId();
    const data: any = {
      ...form,
      accessStartTime: form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null,
      accessEndTime: form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null,
      createdTime: new Date(),
      modifiedTime: new Date(),
      archived: false,
      removed: false
    };
    await this.db.insert(forms).values(data);
    return form;
  }

  private async update(form: Form): Promise<Form> {
    const data: any = {
      name: form.name,
      contentType: form.contentType,
      restricted: form.restricted,
      accessStartTime: form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null,
      accessEndTime: form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null,
      archived: form.archived,
      thankYouMessage: form.thankYouMessage,
      modifiedTime: new Date()
    };
    await this.db.update(forms).set(data)
      .where(and(eq(forms.id, form.id!), eq(forms.churchId, form.churchId!)));
    return form;
  }

  public loadAll(churchId: string) {
    return this.db.select().from(forms)
      .where(and(eq(forms.churchId, churchId), eq(forms.removed, false)));
  }

  public loadAllArchived(churchId: string) {
    return this.db.select().from(forms)
      .where(and(eq(forms.churchId, churchId), eq(forms.removed, false), eq(forms.archived, true)));
  }

  public loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(forms)
      .where(and(eq(forms.churchId, churchId), eq(forms.removed, false), eq(forms.archived, false), inArray(forms.id, ids)));
  }

  public loadNonMemberForms(churchId: string) {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`SELECT * FROM forms WHERE "contentType" <> 'form' AND "churchId" = ${churchId} AND removed = false AND archived = false`
        : sql`SELECT * FROM forms WHERE contentType <> 'form' AND churchId = ${churchId} AND removed = 0 AND archived = 0`
    );
  }

  public loadNonMemberArchivedForms(churchId: string) {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`SELECT * FROM forms WHERE "contentType" <> 'form' AND "churchId" = ${churchId} AND removed = false AND archived = true`
        : sql`SELECT * FROM forms WHERE contentType <> 'form' AND churchId = ${churchId} AND removed = 0 AND archived = 1`
    );
  }

  public loadMemberForms(churchId: string, personId: string) {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT f.*, mp.action FROM forms f
          LEFT JOIN "memberPermissions" mp ON mp."contentId" = f.id
          WHERE mp."memberId" = ${personId} AND f."churchId" = ${churchId} AND f.removed = false AND f.archived = false`
        : sql`
          SELECT f.*, mp.action FROM forms f
          LEFT JOIN memberPermissions mp ON mp.contentId = f.id
          WHERE mp.memberId = ${personId} AND f.churchId = ${churchId} AND f.removed = 0 AND f.archived = 0`
    );
  }

  public loadMemberArchivedForms(churchId: string, personId: string) {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT f.* FROM forms f
          LEFT JOIN "memberPermissions" mp ON mp."contentId" = f.id
          WHERE mp."memberId" = ${personId} AND f."churchId" = ${churchId} AND f.removed = false AND f.archived = true`
        : sql`
          SELECT f.* FROM forms f
          LEFT JOIN memberPermissions mp ON mp.contentId = f.id
          WHERE mp.memberId = ${personId} AND f.churchId = ${churchId} AND f.removed = 0 AND f.archived = 1`
    );
  }

  public async loadWithMemberPermissions(churchId: string, formId: string, personId: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT f.*, mp.action FROM forms f
          LEFT JOIN "memberPermissions" mp ON mp."contentId" = f.id
          WHERE f.id = ${formId} AND f."churchId" = ${churchId} AND mp."memberId" = ${personId} AND f.removed = false AND archived = false`
        : sql`
          SELECT f.*, mp.action FROM forms f
          LEFT JOIN memberPermissions mp ON mp.contentId = f.id
          WHERE f.id = ${formId} AND f.churchId = ${churchId} AND mp.memberId = ${personId} AND f.removed = 0 AND archived = 0`
    );
    return rows[0] ?? null;
  }


  public async access(id: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`SELECT id, name, restricted, "churchId" FROM forms WHERE id = ${id} AND removed = false AND archived = false`
        : sql`SELECT id, name, restricted, churchId FROM forms WHERE id = ${id} AND removed = 0 AND archived = 0`
    );
    return rows[0] ?? null;
  }
}
