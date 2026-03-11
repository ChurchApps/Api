import { injectable } from "inversify";
import { eq, asc, sql, or } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { songDetails, songs, arrangements } from "../../../db/schema/content.js";

@injectable()
export class SongDetailRepo extends GlobalDrizzleRepo<typeof songDetails> {
  protected readonly table = songDetails;
  protected readonly moduleName = "content";

  public loadGlobal(id: string) {
    return this.load(id);
  }

  public async search(query: string): Promise<any[]> {
    const q = "%" + query.replace(/ /g, "%") + "%";
    return this.db.select().from(songDetails)
      .where(or(
        sql`concat(${songDetails.title}, ' ', ${songDetails.artist}) LIKE ${q}`,
        sql`concat(${songDetails.artist}, ' ', ${songDetails.title}) LIKE ${q}`
      ));
  }

  public loadByPraiseChartsId(praiseChartsId: string): Promise<any> {
    return this.db.select().from(songDetails).where(eq(songDetails.praiseChartsId, praiseChartsId)).then(r => r[0] ?? null);
  }

  public async loadForChurch(churchId: string): Promise<any[]> {
    return this.db.select({
      id: songDetails.id,
      praiseChartsId: songDetails.praiseChartsId,
      musicBrainzId: songDetails.musicBrainzId,
      title: songDetails.title,
      artist: songDetails.artist,
      album: songDetails.album,
      language: songDetails.language,
      thumbnail: songDetails.thumbnail,
      releaseDate: songDetails.releaseDate,
      bpm: songDetails.bpm,
      keySignature: songDetails.keySignature,
      seconds: songDetails.seconds,
      meter: songDetails.meter,
      tones: songDetails.tones,
      songId: songs.id,
      churchId: songs.churchId
    })
      .from(songs)
      .innerJoin(arrangements, eq(arrangements.songId, songs.id))
      .innerJoin(songDetails, eq(songDetails.id, arrangements.songDetailId))
      .where(eq(songs.churchId, churchId))
      .orderBy(asc(songDetails.title), asc(songDetails.artist));
  }
}
