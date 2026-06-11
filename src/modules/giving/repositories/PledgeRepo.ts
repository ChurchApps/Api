import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Pledge } from "../models/index.js";

@injectable()
export class PledgeRepo {

  public async save(model: Pledge) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(pledge: Pledge): Promise<Pledge> {
    pledge.id = UniqueIdHelper.shortId();
    await getDb().insertInto("pledges").values({
      id: pledge.id,
      churchId: pledge.churchId,
      campaignId: pledge.campaignId,
      personId: pledge.personId,
      amount: pledge.amount
    } as any).execute();
    return pledge;
  }

  private async update(pledge: Pledge): Promise<Pledge> {
    await getDb().updateTable("pledges").set({
      campaignId: pledge.campaignId,
      personId: pledge.personId,
      amount: pledge.amount
    } as any).where("id", "=", pledge.id).where("churchId", "=", pledge.churchId).execute();
    return pledge;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("pledges").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByCampaignId(churchId: string, campaignId: string) {
    await getDb().deleteFrom("pledges").where("campaignId", "=", campaignId).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("pledges").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("pledges").selectAll()
      .where("churchId", "=", churchId)
      .execute();
    return rows;
  }

  public async loadByCampaignId(churchId: string, campaignId: string) {
    const rows = await getDb().selectFrom("pledges").selectAll()
      .where("churchId", "=", churchId)
      .where("campaignId", "=", campaignId)
      .execute();
    return rows;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const rows = await getDb().selectFrom("pledges").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
    return rows;
  }

  public async loadByCampaignAndPerson(churchId: string, campaignId: string, personId: string) {
    return (await getDb().selectFrom("pledges").selectAll()
      .where("churchId", "=", churchId)
      .where("campaignId", "=", campaignId)
      .where("personId", "=", personId)
      .executeTakeFirst()) ?? null;
  }

  private rowToModel(data: any): Pledge {
    return {
      id: data.id,
      churchId: data.churchId,
      campaignId: data.campaignId,
      personId: data.personId,
      amount: data.amount === null || data.amount === undefined ? undefined : Number(data.amount)
    };
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
