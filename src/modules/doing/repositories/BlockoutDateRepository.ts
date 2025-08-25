import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { BlockoutDate } from "../models";

@injectable()
export class BlockoutDateRepository {
  public save(blockoutDate: BlockoutDate) {
    return blockoutDate.id ? this.update(blockoutDate) : this.create(blockoutDate);
  }

  private async create(blockoutDate: BlockoutDate) {
    blockoutDate.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO blockoutDates (id, churchId, personId, startDate, endDate) VALUES (?, ?, ?, ?, ?);";
    const params = [blockoutDate.id, blockoutDate.churchId, blockoutDate.personId, blockoutDate.startDate, blockoutDate.endDate];
    await DB.query(sql, params);
    return blockoutDate;
  }

  private async update(blockoutDate: BlockoutDate) {
    const sql = "UPDATE blockoutDates SET personId=?, startDate=?, endDate=? WHERE id=? and churchId=?";
    const params = [blockoutDate.personId, blockoutDate.startDate, blockoutDate.endDate, blockoutDate.id, blockoutDate.churchId];
    await DB.query(sql, params);
    return blockoutDate;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM blockoutDates WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM blockoutDates WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM blockoutDates WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadForPerson(churchId: string, personId: string) {
    return DB.query("SELECT * FROM blockoutDates WHERE churchId=? and personId=?;", [churchId, personId]);
  }

  public loadUpcoming(churchId: string) {
    return DB.query("SELECT * FROM blockoutDates WHERE churchId=? AND endDate>NOW();", [churchId]);
  }
}
