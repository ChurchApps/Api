import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Domain } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class DomainRepository extends ConfiguredRepository<Domain> {
  protected get repoConfig(): RepoConfig<Domain> {
    return {
      tableName: "domains",
      hasSoftDelete: false,
      insertColumns: ["domainName"],
      updateColumns: ["domainName"]
    };
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

  protected rowToModel(row: any): Domain {
    return {
      id: row.id,
      churchId: row.churchId,
      domainName: row.domainName
    };
  }
}
