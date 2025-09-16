import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Domain } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class DomainRepository extends ConfiguredRepository<Domain> {
  public constructor() {
    super("domains", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "domainName", type: "string" }
    ]);
  }

  public loadByName(domainName: string) {
    return DB.queryOne("SELECT * FROM `domains` WHERE domainName=?;", [domainName]);
  }

  public loadPairs() {
    return DB.query("select d.domainName as host, concat(c.subDomain, '.b1.church:443') as dial from domains d inner join churches c on c.id=d.churchId WHERE d.domainName NOT like '%www.%';", []);
  }

  public loadByIds(churchId: string, ids: string[]) {
    const sql = "SELECT * FROM `domains` WHERE churchId=? AND id IN (" + ids.join(",") + ") ORDER by name";
    return DB.query(sql, [churchId]);
  }

  public convertToModel(churchId: string, data: any): Domain {
    const result: Domain = {
      id: data.id,
      churchId: data.churchId,
      domainName: data.domainName
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): Domain[] {
    return CollectionHelper.convertAll<Domain>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
