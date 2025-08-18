import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Assignment } from "../models";

@injectable()
export class AssignmentRepository {
  public save(assignment: Assignment) {
    return assignment.id ? this.update(assignment) : this.create(assignment);
  }

  private async create(assignment: Assignment) {
    assignment.id = UniqueIdHelper.shortId();

    const sql =
      "INSERT INTO assignments (id, churchId, positionId, personId, status, notified) VALUES (?, ?, ?, ?, ?, ?);";
    const params = [
      assignment.id,
      assignment.churchId,
      assignment.positionId,
      assignment.personId,
      assignment.status,
      assignment.notified
    ];
    await DB.query(sql, params);
    return assignment;
  }

  private async update(assignment: Assignment) {
    const sql = "UPDATE assignments SET positionId=?, personId=?, status=?, notified=? WHERE id=? and churchId=?";
    const params = [
      assignment.positionId,
      assignment.personId,
      assignment.status,
      assignment.notified,
      assignment.id,
      assignment.churchId
    ];
    await DB.query(sql, params);
    return assignment;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM assignments WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return DB.query(
      "DELETE FROM assignments WHERE churchId=? and positionId IN (SELECT id from positions WHERE planId=?);",
      [churchId, planId]
    );
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM assignments WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByPlanId(churchId: string, planId: string) {
    return DB.query(
      "SELECT a.* FROM assignments a INNER JOIN positions p on p.id=a.positionId WHERE a.churchId=? AND p.planId=?;",
      [churchId, planId]
    );
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return DB.query(
      "SELECT a.* FROM assignments a INNER JOIN positions p on p.id=a.positionId WHERE a.churchId=? AND p.planId IN (?);",
      [churchId, planIds]
    );
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
    return DB.query(sql, [churchId]);
  }

  public loadByByPersonId(churchId: string, personId: string) {
    return DB.query("SELECT * FROM assignments WHERE churchId=? AND personId=?;", [churchId, personId]);
  }
}
