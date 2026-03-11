import { injectable } from "inversify";
import { eq, desc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { playlists } from "../../../db/schema/content.js";

@injectable()
export class PlaylistRepo extends DrizzleRepo<typeof playlists> {
  protected readonly table = playlists;
  protected readonly moduleName = "content";

  public loadById(id: string, churchId: string) {
    return this.loadOne(churchId, id);
  }

  public override async loadAll(churchId: string) {
    return this.db.select().from(playlists).where(eq(playlists.churchId, churchId)).orderBy(desc(playlists.publishDate));
  }

  public loadPublicAll(churchId: string) {
    return this.db.select().from(playlists).where(eq(playlists.churchId, churchId)).orderBy(desc(playlists.publishDate));
  }
}
