import { injectable } from "inversify";
import { eq, and, inArray, gt, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { blockoutDates } from "../../../db/schema/doing.js";
import { BlockoutDate } from "../models/index.js";

@injectable()
export class BlockoutDateRepo extends DrizzleRepo<typeof blockoutDates> {
  protected readonly table = blockoutDates;
  protected readonly moduleName = "doing";

  public override async save(model: BlockoutDate) {
    const processedData = { ...model } as any;
    if (processedData.startDate) {
      processedData.startDate = DateHelper.toMysqlDateOnly(processedData.startDate);
    }
    if (processedData.endDate) {
      processedData.endDate = DateHelper.toMysqlDateOnly(processedData.endDate);
    }

    if (processedData.id) {
      await this.db.update(blockoutDates).set(processedData).where(and(eq(blockoutDates.id, processedData.id), eq(blockoutDates.churchId, processedData.churchId)));
    } else {
      processedData.id = UniqueIdHelper.shortId();
      await this.db.insert(blockoutDates).values(processedData);
    }
    return processedData as BlockoutDate;
  }

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(blockoutDates).where(and(eq(blockoutDates.churchId, churchId), inArray(blockoutDates.id, ids)));
  }

  public loadForPerson(churchId: string, personId: string) {
    return this.db.select().from(blockoutDates).where(and(eq(blockoutDates.churchId, churchId), eq(blockoutDates.personId, personId)));
  }

  public loadUpcoming(churchId: string) {
    const today = DateHelper.toMysqlDateOnly(new Date()) as string;
    return this.db.select().from(blockoutDates).where(and(eq(blockoutDates.churchId, churchId), gt(blockoutDates.endDate, sql`${today}`)));
  }
}
