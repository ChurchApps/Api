import { RepoManager } from "../infrastructure/RepoManager.js";
import { civilDate, civilISO, CivilOccurrence } from "../helpers/CivilDate.js";
import type { Repos as ContentRepos } from "../../modules/content/repositories/index.js";
import type { ContentDatabase } from "../../modules/content/db/DatabaseTypes.js";
import type { Event, EventBooking, EventRsvp, File, Link, Registration, RegistrationMember } from "../../modules/content/models/index.js";

// The fields the recurrence engine reads from an event.
interface RecurringEventSource {
  start: Date | string;
  end: Date | string;
  recurrenceRule?: string;
  exceptionDates?: Array<Date | string>;
}

// Gateway: the only seam through which other modules read content data.
export interface ContentModuleGateway {
  loadRegistrationsByPerson(churchId: string, personId: string): Promise<Registration[]>;
  loadRegistrationMembersByPerson(churchId: string, personId: string): Promise<RegistrationMember[]>;
  loadEventRsvpsByPerson(churchId: string, personId: string): Promise<EventRsvp[]>;
  loadEventBookingsByPerson(churchId: string, personId: string): Promise<EventBooking[]>;
  // Documents and links kept on the person's record (files.contentType "person", links.category "personLink").
  loadPersonDocuments(churchId: string, personId: string): Promise<{ files: File[]; links: Link[] }>;
  loadEvent(churchId: string, eventId: string): Promise<Event | null>;
  // Events of a group that collect registration answers through a form.
  loadEventsForGroup(churchId: string, groupId: string): Promise<{ id: string; title: string; start: Date; groupId: string; formId: string }[]>;
  // Expand a recurring event's occurrences in the window to civil-local dates.
  // Lives here (not in messaging) so the recurrence engine stays inside content.
  expandEventOccurrences(event: RecurringEventSource, from: Date, to: Date): Promise<CivilOccurrence[]>;
  // Cascade-delete all content owned by a non-primary site (membership calls this on site delete).
  deleteSiteContent(churchId: string, siteId: string): Promise<void>;
}

class ContentModuleGatewayDb implements ContentModuleGateway {
  private async repos() {
    return RepoManager.getRepos<ContentRepos>("content");
  }

  public async loadRegistrationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).registration.loadForPerson(churchId, personId);
  }

  // Lazy-load so importers of this gateway don't transitively pull Environment at module scope.
  private async db() {
    const { KyselyPool } = await import("../infrastructure/KyselyPool.js");
    return KyselyPool.getDb<ContentDatabase>("content");
  }

  public async loadRegistrationMembersByPerson(churchId: string, personId: string) {
    return (await this.db()).selectFrom("registrationMembers").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
  }

  public async loadEventRsvpsByPerson(churchId: string, personId: string) {
    return (await this.db()).selectFrom("eventRsvps").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
  }

  public async loadEventBookingsByPerson(churchId: string, personId: string) {
    return (await this.db()).selectFrom("eventBookings").selectAll()
      .where("churchId", "=", churchId)
      .where("requestedBy", "=", personId)
      .execute();
  }

  public async loadPersonDocuments(churchId: string, personId: string) {
    const db = await this.db();
    const [files, links] = await Promise.all([
      db.selectFrom("files").select(["id", "fileName", "fileType", "size", "dateModified"]).where("churchId", "=", churchId).where("contentType", "=", "person").where("contentId", "=", personId).execute(),
      db.selectFrom("links").select(["id", "text", "url"]).where("churchId", "=", churchId).where("category", "=", "personLink").where("linkData", "=", personId).execute()
    ]);
    return { files: files as File[], links: links as Link[] };
  }

  public async loadEvent(churchId: string, eventId: string) {
    const row = await (await this.db()).selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("id", "=", eventId)
      .executeTakeFirst();
    return row ?? null;
  }

  public async loadEventsForGroup(churchId: string, groupId: string) {
    return (await this.db()).selectFrom("events").select(["id", "title", "start", "groupId", "formId"])
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId)
      .where("formId", "is not", null)
      .where("formId", "<>", "")
      .orderBy("start", "desc")
      .execute();
  }

  public async expandEventOccurrences(event: RecurringEventSource, from: Date, to: Date): Promise<CivilOccurrence[]> {
    const { RecurrenceHelper } = await import("../../modules/content/helpers/RecurrenceHelper.js");
    const occ = RecurrenceHelper.getOccurrences(event, from, to, 200) as { start: Date }[];
    return occ.map((o) => ({ startLocalDate: civilDate(o.start), startLocalISO: civilISO(o.start) }));
  }

  public async deleteSiteContent(churchId: string, siteId: string): Promise<void> {
    // Guard: '' is the primary/shared sentinel — never cascade it.
    if (!siteId) throw new Error("deleteSiteContent requires a non-empty siteId");
    // Lazy-load so importers of this gateway don't transitively pull Environment at module scope.
    const { KyselyPool } = await import("../infrastructure/KyselyPool.js");
    const pool = KyselyPool.getDb<ContentDatabase>("content");

    // Destructive multi-table cascade — one transaction so a mid-sequence failure rolls back cleanly.
    await pool.transaction().execute(async (db) => {
      // 1. Pages owned by the site → their sections/elements/history/posts.
      const pageRows = await db.selectFrom("pages").select("id").where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
      const pageIds = pageRows.map((r) => r.id);
      if (pageIds.length > 0) {
        const sectionRows = await db.selectFrom("sections").select("id").where("churchId", "=", churchId).where("pageId", "in", pageIds).execute();
        const sectionIds = sectionRows.map((r) => r.id);
        if (sectionIds.length > 0) {
          await db.deleteFrom("elements").where("churchId", "=", churchId).where("sectionId", "in", sectionIds).execute();
          await db.deleteFrom("sections").where("churchId", "=", churchId).where("id", "in", sectionIds).execute();
        }
        await db.deleteFrom("pageHistory").where("churchId", "=", churchId).where("pageId", "in", pageIds).execute();
        await db.deleteFrom("pages").where("churchId", "=", churchId).where("id", "in", pageIds).execute();
      }

      // 2. Blocks owned by the site → their sections/elements/history.
      const blockRows = await db.selectFrom("blocks").select("id").where("churchId", "=", churchId).where("siteId", "=", siteId).execute();
      const blockIds = blockRows.map((r) => r.id);
      if (blockIds.length > 0) {
        const blockSectionRows = await db.selectFrom("sections").select("id").where("churchId", "=", churchId).where("blockId", "in", blockIds).execute();
        const blockSectionIds = blockSectionRows.map((r) => r.id);
        await db.deleteFrom("elements").where("churchId", "=", churchId)
          .where((eb) => eb.or([
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
