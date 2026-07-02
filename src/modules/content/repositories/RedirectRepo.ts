import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Redirect } from "../models/index.js";

@injectable()
export class RedirectRepo {
  public static normalizePath(path: string): string {
    if (!path) return path;
    let p = path.trim().toLowerCase();
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
    return p;
  }

  public async save(model: Redirect) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Redirect): Promise<Redirect> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    if (!model.createdDate) model.createdDate = new Date();
    await getDb().insertInto("redirects").values({
      id: model.id,
      churchId: model.churchId,
      fromPath: model.fromPath,
      toPath: model.toPath,
      createdDate: model.createdDate
    } as any).execute();
    return model;
  }

  private async update(model: Redirect): Promise<Redirect> {
    await getDb().updateTable("redirects").set({
      fromPath: model.fromPath,
      toPath: model.toPath
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("redirects").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Redirect | undefined> {
    return (await getDb().selectFrom("redirects").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Redirect[]> {
    return getDb().selectFrom("redirects").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadByFromPath(churchId: string, fromPath: string): Promise<Redirect[]> {
    return getDb().selectFrom("redirects").selectAll().where("churchId", "=", churchId).where("fromPath", "=", fromPath).execute() as any;
  }

  public async count(churchId: string): Promise<number> {
    const row = await getDb().selectFrom("redirects").select((eb) => eb.fn.countAll().as("count")).where("churchId", "=", churchId).executeTakeFirst();
    return Number((row as any)?.count ?? 0);
  }

  public convertToModel(_churchId: string, data: any) { return data as Redirect; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Redirect[]; }
}
