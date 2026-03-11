import { injectable } from "inversify";
import { eq, and, asc, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { songs } from "../../../db/schema/content.js";

@injectable()
export class SongRepo extends DrizzleRepo<typeof songs> {
  protected readonly table = songs;
  protected readonly moduleName = "content";

  public override async loadAll(churchId: string) {
    return this.db.select().from(songs).where(eq(songs.churchId, churchId)).orderBy(asc(songs.name));
  }

  public async search(churchId: string, query: string): Promise<any[]> {
    const q = "%" + query.replace(/ /g, "%") + "%";
    return this.executeRows(sql`
      SELECT sd.*, ak.id as arrangementKeyId, ak.keySignature as arrangementKeySignature, ak.shortDescription
      FROM songs s
      INNER JOIN arrangements a ON a.songId = s.id
      INNER JOIN arrangementKeys ak ON ak.arrangementId = a.id
      INNER JOIN songDetails sd ON sd.id = a.songDetailId
      WHERE s.churchId = ${churchId}
        AND (CONCAT(sd.title, ' ', sd.artist) LIKE ${q} OR CONCAT(sd.artist, ' ', sd.title) LIKE ${q})
    `);
  }
}
