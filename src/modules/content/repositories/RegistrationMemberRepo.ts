import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { RegistrationMember } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationMemberRepo {
  public async save(model: RegistrationMember) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationMember): Promise<RegistrationMember> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("registrationMembers").values({
      id: model.id,
      churchId: model.churchId,
      registrationId: model.registrationId,
      personId: model.personId,
      firstName: model.firstName,
      lastName: model.lastName
    } as any).execute();
    return model;
  }

  private async update(model: RegistrationMember): Promise<RegistrationMember> {
    await getDb().updateTable("registrationMembers").set({
      registrationId: model.registrationId,
      personId: model.personId,
      firstName: model.firstName,
      lastName: model.lastName
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationMembers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<RegistrationMember | undefined> {
    return (await getDb().selectFrom("registrationMembers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<RegistrationMember[]> {
    return getDb().selectFrom("registrationMembers").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadForRegistration(churchId: string, registrationId: string): Promise<RegistrationMember[]> {
    return getDb().selectFrom("registrationMembers").selectAll()
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute() as any;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<RegistrationMember[]> {
    return getDb().selectFrom("registrationMembers as rm")
      .innerJoin("registrations as r", "rm.registrationId", "r.id")
      .selectAll("rm")
      .where("r.churchId", "=", churchId)
      .where("r.eventId", "=", eventId)
      .execute() as any;
  }

  public async deleteForRegistration(churchId: string, registrationId: string): Promise<void> {
    await getDb().deleteFrom("registrationMembers")
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute();
  }

  public convertToModel(_churchId: string, data: any) { return data as RegistrationMember; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as RegistrationMember[]; }
}
