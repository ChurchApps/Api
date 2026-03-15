import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { songDetailLinks } from "../../../db/schema/content.js";

@injectable()
export class SongDetailLinkRepo extends GlobalDrizzleRepo<typeof songDetailLinks> {
  protected readonly table = songDetailLinks;
  protected readonly moduleName = "content";

  public loadForSongDetail(songDetailId: string) {
    return this.db.select().from(songDetailLinks).where(eq(songDetailLinks.songDetailId, songDetailId)).orderBy(asc(songDetailLinks.service));
  }

  public loadByServiceAndKey(service: string, serviceKey: string) {
    return this.db.select().from(songDetailLinks).where(and(eq(songDetailLinks.service, service), eq(songDetailLinks.serviceKey, serviceKey))).then(r => r[0] ?? null);
  }
}
