import { UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { RegistrationSelectionChoice } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationSelectionChoiceRepo {
  public async save(model: RegistrationSelectionChoice) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationSelectionChoice): Promise<RegistrationSelectionChoice> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("registrationSelectionChoices").values({
      id: model.id,
      churchId: model.churchId,
      registrationId: model.registrationId,
      registrationMemberId: model.registrationMemberId ?? null,
      selectionId: model.selectionId,
      quantity: model.quantity ?? 1
    } as any).execute();
    return model;
  }

  private async update(model: RegistrationSelectionChoice): Promise<RegistrationSelectionChoice> {
    await getDb().updateTable("registrationSelectionChoices").set({
      registrationMemberId: model.registrationMemberId ?? null,
      selectionId: model.selectionId,
      quantity: model.quantity ?? 1
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationSelectionChoices").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async loadForRegistration(churchId: string, registrationId: string): Promise<RegistrationSelectionChoice[]> {
    return getDb().selectFrom("registrationSelectionChoices").selectAll()
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute() as any;
  }

  public async deleteForRegistration(churchId: string, registrationId: string): Promise<void> {
    await getDb().deleteFrom("registrationSelectionChoices")
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute();
  }

  // Quantity-aware capacity guard: SUM of existing active quantities + this quantity must
  // stay within the selection capacity, enforced atomically in one INSERT...SELECT.
  public async atomicInsertWithCapacityCheck(model: RegistrationSelectionChoice, capacity: number | null): Promise<boolean> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    const qty = model.quantity ?? 1;

    if (capacity === null || capacity === undefined) {
      await this.create(model);
      return true;
    }

    const result: any = await sql`INSERT INTO registrationSelectionChoices (id, churchId, registrationId, registrationMemberId, selectionId, quantity)
      SELECT ${model.id}, ${model.churchId}, ${model.registrationId}, ${model.registrationMemberId || null}, ${model.selectionId}, ${qty}
      FROM dual
      WHERE (SELECT COALESCE(SUM(c.quantity),0) FROM registrationSelectionChoices c JOIN registrations r ON r.id=c.registrationId
             WHERE c.selectionId=${model.selectionId} AND r.status IN ('pending','confirmed')) + ${qty} <= ${capacity}`.execute(getDb());
    return result?.numAffectedRows > 0n || result?.affectedRows > 0;
  }

  public convertToModel(_churchId: string, data: any) { return data as RegistrationSelectionChoice; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as RegistrationSelectionChoice[]; }
}
