import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { eventExceptions } from "../../../db/schema/content.js";

@injectable()
export class EventExceptionRepo extends DrizzleRepo<typeof eventExceptions> {
  protected readonly table = eventExceptions;
  protected readonly moduleName = "content";

  public loadForEvents(churchId: string, eventIds: string[]) {
    return this.db.select().from(eventExceptions).where(and(eq(eventExceptions.churchId, churchId), inArray(eventExceptions.eventId, eventIds)));
  }
}
