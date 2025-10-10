import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Assignment } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class AssignmentRepo extends ConfiguredRepo<Assignment> {
  protected get repoConfig(): RepoConfig<Assignment> {
    return {
      tableName: "assignments",
      hasSoftDelete: false,
      columns: ["positionId", "personId", "status", "notified"]
    };
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return TypedDB.query("DELETE FROM assignments WHERE churchId=? and positionId IN (SELECT id from positions WHERE planId=?);", [churchId, planId]);
  }

  public loadByPlanId(churchId: string, planId: string) {
    return TypedDB.query("SELECT a.* FROM assignments a INNER JOIN positions p on p.id=a.positionId WHERE a.churchId=? AND p.planId=?;", [churchId, planId]);
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return TypedDB.query("SELECT a.* FROM assignments a INNER JOIN positions p on p.id=a.positionId WHERE a.churchId=? AND p.planId IN (?);", [churchId, planIds]);
  }

  public loadLastServed(churchId: string) {
    const sql =
      "select a.personId, max(pl.serviceDate) as serviceDate" +
      " from assignments a" +
      " inner join positions p on p.id = a.positionId" +
      " inner join plans pl on pl.id = p.planId" +
      " where a.churchId=?" +
      " group by a.personId" +
      " order by max(pl.serviceDate)";
    return TypedDB.query(sql, [churchId]);
  }

  public loadByByPersonId(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM assignments WHERE churchId=? AND personId=?;", [churchId, personId]);
  }

  public loadUnconfirmedByServiceDateRange(churchId?: string) {
    let sql =
      "SELECT a.*, pl.serviceDate, pl.name as planName" +
      " FROM assignments a" +
      " INNER JOIN positions p ON p.id = a.positionId" +
      " INNER JOIN plans pl ON pl.id = p.planId" +
      " WHERE a.status = 'Unconfirmed'" +
      " AND pl.serviceDate >= DATE_ADD(CURDATE(), INTERVAL 2 DAY)" +
      " AND pl.serviceDate < DATE_ADD(CURDATE(), INTERVAL 3 DAY)";

    const params: any[] = [];
    if (churchId) {
      sql += " AND a.churchId = ?";
      params.push(churchId);
    }

    return TypedDB.query(sql, params);
  }

  public loadByServiceDate(churchId: string, serviceDate: Date, excludePlanId?: string) {
    let sql = "SELECT a.* FROM assignments a" + " INNER JOIN positions p ON p.id = a.positionId" + " INNER JOIN plans pl ON pl.id = p.planId" + " WHERE a.churchId = ? AND DATE(pl.serviceDate) = DATE(?)";
    const params: any[] = [churchId, serviceDate];
    if (excludePlanId) {
      sql += " AND pl.id != ?";
      params.push(excludePlanId);
    }
    return TypedDB.query(sql, params);
  }
}
