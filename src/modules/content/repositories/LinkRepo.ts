import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { links } from "../../../db/schema/content.js";
import { Link } from "../models/index.js";

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
export class LinkRepo extends DrizzleRepo<typeof links> {
  protected readonly table = links;
  protected readonly moduleName = "content";

  public override async loadAll(churchId: string) {
    return this.db.select().from(links).where(eq(links.churchId, churchId)).orderBy(asc(links.sort));
  }

  public async loadByCategory(churchId: string, category: string): Promise<any[]> {
    let result = await this.db.select().from(links).where(and(eq(links.churchId, churchId), eq(links.category, category))).orderBy(asc(links.sort));

    // Create default b1Tab links if none exist
    if (category === "b1Tab" && result.length === 0) {
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
      result = defaults as any;
    }

    return result;
  }

  public async sort(churchId: string, category: string, parentId: string) {
    const existing = await this.loadByCategory(churchId, category);
    const filtered = ArrayHelper.getAll(existing, "parentId", parentId);
    const toSave: any[] = [];
    filtered.forEach((link: any, index: number) => {
      if (link.sort !== index) {
        link.sort = index;
        toSave.push(link);
      }
    });
    const promises: Promise<any>[] = [];
    toSave.forEach((link) => promises.push(this.save(link)));
    await Promise.all(promises);
  }

  public loadById(id: string, churchId: string) {
    return this.loadOne(churchId, id);
  }

  public convertToModel(_churchId: string, data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any) {
    return (Array.isArray(data) ? data : []).map((d: any) => this.rowToModel(d));
  }

  private rowToModel(row: any): Link {
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
