import { injectable } from "inversify";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { curatedCalendars } from "../../../db/schema/content.js";

@injectable()
export class CuratedCalendarRepo extends DrizzleRepo<typeof curatedCalendars> {
  protected readonly table = curatedCalendars;
  protected readonly moduleName = "content";
}
