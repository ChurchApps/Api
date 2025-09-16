import { injectable } from "inversify";
import { ConfiguredRepository, type RepoConfig } from "../../../shared/infrastructure";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Service } from "../models";

@injectable()
export class ServiceRepository extends ConfiguredRepository<Service> {
  protected get repoConfig(): RepoConfig<Service> {
    return {
      tableName: "services",
      hasSoftDelete: true,
      defaultOrderBy: "name",
      insertColumns: ["campusId", "name"],
      updateColumns: ["campusId", "name"],
      insertLiterals: { removed: "0" }
    };
  }

  public async loadWithCampus(churchId: string) {
    const result = await TypedDB.query(
      "SELECT s.*, c.name as campusName FROM services s INNER JOIN campuses c on c.id=s.campusId WHERE s.churchId=? AND s.removed=0 and c.removed=0 ORDER BY c.name, s.name",
      [churchId]
    );
    return this.convertAllToModel(churchId, result);
  }

  public async searchByCampus(churchId: string, campusId: string) {
    const result = await TypedDB.query("SELECT * FROM services WHERE churchId=? AND (?=0 OR CampusId=?) AND removed=0 ORDER by name;", [churchId, campusId, campusId]);
    return this.convertAllToModel(churchId, result);
  }

  protected rowToModel(data: any): Service {
    const result: Service = { id: data.id, campusId: data.campusId, name: data.name };
    if (data.campusName !== undefined) result.campus = { id: result.campusId, name: data.campusName };
    return result;
  }
}
