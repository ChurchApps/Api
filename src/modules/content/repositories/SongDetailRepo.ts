import { injectable } from "inversify";
import { eq, asc, sql } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { songDetails } from "../../../db/schema/content.js";

@injectable()
export class SongDetailRepo extends GlobalDrizzleRepo<typeof songDetails> {
  protected readonly table = songDetails;
  protected readonly moduleName = "content";

  public loadGlobal(id: string) {
    return this.load(id);
  }

  public async search(query: string): Promise<any[]> {
    const q = "%" + query.replace(/ /g, "%") + "%";
    return this.executeRows(sql`
      SELECT * FROM songDetails WHERE CONCAT(title, ' ', artist) LIKE ${q} OR CONCAT(artist, ' ', title) LIKE ${q}
    `);
  }

  public loadByPraiseChartsId(praiseChartsId: string): Promise<any> {
    return this.db.select().from(songDetails).where(eq(songDetails.praiseChartsId, praiseChartsId)).then(r => r[0] ?? null);
  }

  public async loadForChurch(churchId: string): Promise<any[]> {
    return this.executeRows(sql`
      SELECT sd.*, s.id as songId, s.churchId
      FROM songs s
      INNER JOIN arrangements a ON a.songId = s.id
      INNER JOIN songDetails sd ON sd.id = a.songDetailId
      WHERE s.churchId = ${churchId}
      ORDER BY sd.title, sd.artist
    `);
  }
}
