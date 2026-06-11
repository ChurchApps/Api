import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Room } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RoomRepo {
  public async save(model: Room) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Room): Promise<Room> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("rooms").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      description: model.description,
      capacity: model.capacity,
      approvalGroupId: model.approvalGroupId
    } as any).execute();
    return model;
  }

  private async update(model: Room): Promise<Room> {
    await getDb().updateTable("rooms").set({
      name: model.name,
      description: model.description,
      capacity: model.capacity,
      approvalGroupId: model.approvalGroupId
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("rooms").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Room | undefined> {
    return (await getDb().selectFrom("rooms").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Room[]> {
    return getDb().selectFrom("rooms").selectAll().where("churchId", "=", churchId).orderBy("name").execute() as any;
  }

  public async loadByIds(churchId: string, ids: string[]): Promise<Room[]> {
    if (ids.length === 0) return [];
    return getDb().selectFrom("rooms").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Room; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Room[]; }
}
