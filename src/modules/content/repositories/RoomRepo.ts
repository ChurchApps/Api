import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Room } from "../models/index.js";
import { injectable } from "inversify";
import type { TinyIntActive } from "./types.js";

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
      approvalGroupId: model.approvalGroupId,
      active: model.active ?? true,
      categoryName: model.categoryName?.trim() || null
    }).execute();
    return model;
  }

  private async update(model: Room): Promise<Room> {
    await getDb().updateTable("rooms").set({
      name: model.name,
      description: model.description,
      capacity: model.capacity,
      approvalGroupId: model.approvalGroupId ?? null,
      active: model.active ?? true,
      categoryName: model.categoryName?.trim() || null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("rooms").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Room | undefined> {
    const row = await getDb().selectFrom("rooms").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return row ? this.convertToModel(churchId, row) : null;
  }

  public async loadAll(churchId: string): Promise<Room[]> {
    return this.convertAllToModel(churchId, await getDb().selectFrom("rooms").selectAll().where("churchId", "=", churchId).orderBy("name").execute());
  }

  public async loadByIds(churchId: string, ids: string[]): Promise<Room[]> {
    if (ids.length === 0) return [];
    return this.convertAllToModel(churchId, await getDb().selectFrom("rooms").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute());
  }

  // MySQL returns TINYINT(1) as 0/1.
  public convertToModel(_churchId: string, data: TinyIntActive<Room>) {
    if (!data) return data as Room;
    return { ...data, active: data.active === undefined ? true : !!data.active } as Room;
  }

  public convertAllToModel(churchId: string, data: TinyIntActive<Room>[]) { return (data || []).map((d) => this.convertToModel(churchId, d)); }
}
