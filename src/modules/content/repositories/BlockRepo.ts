import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { blocks } from "../../../db/schema/content.js";

@injectable()
export class BlockRepo extends DrizzleRepo<typeof blocks> {
  protected readonly table = blocks;
  protected readonly moduleName = "content";

  public loadByBlockType(churchId: string, blockType: string) {
    return this.db.select().from(blocks).where(and(eq(blocks.churchId, churchId), eq(blocks.blockType, blockType))).orderBy(asc(blocks.name));
  }
}
