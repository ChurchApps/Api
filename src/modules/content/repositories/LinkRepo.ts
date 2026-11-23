import { injectable } from "inversify";
import { Link } from "../models/index.js";
import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import type { LinkRow } from "./types.js";

@injectable()
export class LinkRepo {
  public async save(model: Link) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Link): Promise<Link> {
    if (!model.id){
      model.id = UniqueIdHelper.shortId();
    }
    await getDb().insertInto("links").values({
      id: model.id,
      churchId: model.churchId,
      siteId: model.siteId ?? "",
      category: model.category,
      url: model.url,
      linkType: model.linkType,
      linkData: model.linkData,
      photo: model.photo,
      icon: model.icon,
      text: model.text,
      sort: model.sort,
      parentId: model.parentId,
      visibility: model.visibility,
      groupIds: model.groupIds
    }).execute();
    return model;
  }

  private async update(model: Link): Promise<Link> {
    await getDb().updateTable("links").set({
      siteId: model.siteId ?? "",
      category: model.category,
      url: model.url,
      linkType: model.linkType,
      linkData: model.linkData,
      photo: model.photo,
      icon: model.icon,
      text: model.text,
      sort: model.sort,
      parentId: model.parentId,
      visibility: model.visibility,
      groupIds: model.groupIds
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("links").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Link | undefined> {
    return (await getDb().selectFrom("links").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string, siteId = ""): Promise<Link[]> {
    return getDb().selectFrom("links").selectAll().where("churchId", "=", churchId).where("siteId", "=", siteId).orderBy("sort").execute();
  }

  public async loadByCategoryAndData(churchId: string, category: string, linkData: string): Promise<Link[]> {
    return getDb().selectFrom("links").selectAll()
      .where("churchId", "=", churchId)
      .where("category", "=", category)
      .where("linkData", "=", linkData)
      .orderBy("sort").execute();
  }

  public async loadByCategory(churchId: string, category: string, siteId = ""): Promise<Link[]> {
    return getDb().selectFrom("links").selectAll()
      .where("churchId", "=", churchId)
      .where("category", "=", category)
      .where("siteId", "=", siteId)
      .orderBy("sort").execute();
  }

  // siteId must scope the re-sort — otherwise re-ordering one site's nav corrupts another's.
  public async sort(churchId: string, category: string, parentId: string, siteId = "") {
    const existing = await this.loadByCategory(churchId, category, siteId);
    const filtered = ArrayHelper.getAll(existing, "parentId", parentId);
    const toSave: Link[] = [];
    filtered.forEach((link, index) => {
      if (link.sort !== index) {
        link.sort = index;
        toSave.push(link);
      }
    });
    const promises: Promise<Link>[] = [];
    toSave.forEach((link) => promises.push(this.save(link)));
    await Promise.all(promises);
  }

  public async loadById(id: string, churchId: string): Promise<Link | undefined> {
    return (await getDb().selectFrom("links").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public convertToModel(_churchId: string, data: Link) { return data; }
  public convertAllToModel(_churchId: string, data: Link[]) { return data || []; }

  protected rowToModel(row: LinkRow): Link {
    const result = { ...row };
    if (result.photo === undefined) {
      if (!result.photoUpdated) {
        result.photo = "";
      } else {
        result.photo = "/" + result.churchId + "/b1/tabs/" + row.id + ".png?dt=" + row.photoUpdated.getTime().toString();
      }
    }
    return result;
  }
}
