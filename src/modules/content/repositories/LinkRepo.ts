import { injectable } from "inversify";
import { Link } from "../models/index.js";
import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";

const DEFAULT_B1TAB_LINKS: Partial<Link>[] = [
  { linkType: "bible", text: "Bible", icon: "menu_book", visibility: "everyone", sort: 1 },
  { linkType: "votd", text: "Verse of the Day", icon: "format_quote", visibility: "everyone", sort: 2 },
  { linkType: "sermons", text: "Sermons", icon: "play_circle", visibility: "everyone", sort: 3 },
  { linkType: "stream", text: "Live", icon: "live_tv", visibility: "everyone", sort: 4 },
  { linkType: "donation", text: "Give", icon: "volunteer_activism", visibility: "everyone", sort: 5 },
  { linkType: "groups", text: "My Groups", icon: "groups", visibility: "visitors", sort: 6 },
  { linkType: "directory", text: "Directory", icon: "people", visibility: "members", sort: 7 },
  { linkType: "lessons", text: "Lessons", icon: "school", visibility: "visitors", sort: 8 },
  { linkType: "plans", text: "Serving", icon: "assignment", visibility: "team", sort: 9 },
  { linkType: "checkin", text: "Check-in", icon: "how_to_reg", visibility: "visitors", sort: 10 }
];

@injectable()
export class LinkRepo {
  public async save(model: Link) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Link): Promise<Link> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("links").values({
      id: model.id,
      churchId: model.churchId,
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
    } as any).execute();
    return model;
  }

  private async update(model: Link): Promise<Link> {
    await getDb().updateTable("links").set({
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
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("links").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Link | undefined> {
    return (await getDb().selectFrom("links").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Link[]> {
    return getDb().selectFrom("links").selectAll().where("churchId", "=", churchId).orderBy("sort").execute() as any;
  }

  public async loadByCategory(churchId: string, category: string): Promise<Link[]> {
    let links = await getDb().selectFrom("links").selectAll()
      .where("churchId", "=", churchId)
      .where("category", "=", category)
      .orderBy("sort").execute() as any as Link[];

    // Create default b1Tab links if none exist
    if (category === "b1Tab" && links.length === 0) {
      const defaults: Link[] = DEFAULT_B1TAB_LINKS.map(item => ({
        ...item,
        id: UniqueIdHelper.shortId(),
        churchId,
        category: "b1Tab",
        linkData: "",
        url: ""
      } as Link));

      for (const link of defaults) {
        await this.save(link);
      }
      links = defaults;
    }

    return links;
  }

  public async sort(churchId: string, category: string, parentId: string) {
    const existing = await this.loadByCategory(churchId, category);
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

  public convertToModel(_churchId: string, data: any) { return data as Link; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Link[]; }

  protected rowToModel(row: any): Link {
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
