import { RepoManager } from "../infrastructure/RepoManager.js";
import { civilDate, civilISO, CivilOccurrence } from "../helpers/CivilDate.js";

// Gateway: the only seam through which other modules read content data.
export interface ContentModuleGateway {
  loadRegistrationsByPerson(churchId: string, personId: string): Promise<any[]>;
  // Expand a recurring event's occurrences in the window to civil-local dates.
  // Lives here (not in messaging) so the recurrence engine stays inside content.
  expandEventOccurrences(event: any, from: Date, to: Date): Promise<CivilOccurrence[]>;
  // Cascade-delete all content owned by a non-primary site (membership calls this on site delete).
  deleteSiteContent(churchId: string, siteId: string): Promise<void>;
}

class ContentModuleGatewayDb implements ContentModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("content");
  }

  public async loadRegistrationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).registration.loadForPerson(churchId, personId);
  }

  public async expandEventOccurrences(event: any, from: Date, to: Date): Promise<CivilOccurrence[]> {
    const { RecurrenceHelper } = await import("../../modules/content/helpers/RecurrenceHelper.js");
    const occ = RecurrenceHelper.getOccurrences(event, from, to, 200) as { start: Date }[];
    return occ.map((o) => ({ startLocalDate: civilDate(o.start), startLocalISO: civilISO(o.start) }));
  }

  public async deleteSiteContent(churchId: string, siteId: string): Promise<void> {
    // Guard: '' is the primary/shared sentinel — never cascade it.
    if (!siteId) throw new Error("deleteSiteContent requires a non-empty siteId");
    // Lazy-load so importers of this gateway don't transitively pull Environment at module scope.
    const { KyselyPool } = await import("../infrastructure/KyselyPool.js");
    const pool = KyselyPool.getDb<any>("content");

    // Destructive multi-table cascade — one transaction so a mid-sequence failure rolls back cleanly.
    await pool.transaction().execute(async (db: any) => {
      // 1. Pages owned by the site → their sections/elements/history/posts.
      const pageRows = await db.selectFrom("pages").select("id").where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
      const pageIds = pageRows.map((r: any) => r.id);
      if (pageIds.length > 0) {
        const sectionRows = await db.selectFrom("sections").select("id").where("churchId", "=", churchId).where("pageId", "in", pageIds).execute();
        const sectionIds = sectionRows.map((r: any) => r.id);
        if (sectionIds.length > 0) {
          await db.deleteFrom("elements").where("churchId", "=", churchId).where("sectionId", "in", sectionIds).execute();
          await db.deleteFrom("sections").where("churchId", "=", churchId).where("id", "in", sectionIds).execute();
        }
        await db.deleteFrom("pageHistory").where("churchId", "=", churchId).where("pageId", "in", pageIds).execute();
        await db.deleteFrom("posts").where("churchId", "=", churchId).where("pageId", "in", pageIds).execute();
        await db.deleteFrom("pages").where("churchId", "=", churchId).where("id", "in", pageIds).execute();
      }

      // 2. Blocks owned by the site → their sections/elements/history.
      const blockRows = await db.selectFrom("blocks").select("id").where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
      const blockIds = blockRows.map((r: any) => r.id);
      if (blockIds.length > 0) {
        const blockSectionRows = await db.selectFrom("sections").select("id").where("churchId", "=", churchId).where("blockId", "in", blockIds).execute();
        const blockSectionIds = blockSectionRows.map((r: any) => r.id);
        await db.deleteFrom("elements").where("churchId", "=", churchId)
          .where((eb: any) => eb.or([
            eb("blockId", "in", blockIds),
            eb("sectionId", "in", blockSectionIds.length > 0 ? blockSectionIds : [""])
          ])).execute();
        if (blockSectionIds.length > 0) {
          await db.deleteFrom("sections").where("churchId", "=", churchId).where("id", "in", blockSectionIds).execute();
        }
        await db.deleteFrom("pageHistory").where("churchId", "=", churchId).where("blockId", "in", blockIds).execute();
        await db.deleteFrom("blocks").where("churchId", "=", churchId).where("id", "in", blockIds).execute();
      }

      // 3. Site-scoped links + globalStyles.
      await db.deleteFrom("links").where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
      await db.deleteFrom("globalStyles").where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
    });
  }
}

let _instance: ContentModuleGateway;
export const getContentModuleGateway = (): ContentModuleGateway => (_instance ??= new ContentModuleGatewayDb());
