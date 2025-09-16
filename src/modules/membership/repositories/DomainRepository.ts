import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Domain } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class DomainRepository extends ConfiguredRepository<Domain> {
  protected get repoConfig(): RepoConfig<Domain> {
    return {
      tableName: "domains",
      hasSoftDelete: false,
      columns: ["domainName"]
    };
  }

  public loadByName(domainName: string) {
    return TypedDB.queryOne("SELECT * FROM `domains` WHERE domainName=?;", [domainName]);
  }

  public loadPairs() {
    return TypedDB.query(
      "select d.domainName as host, concat(c.subDomain, '.b1.church:443') as dial from domains d inner join churches c on c.id=d.churchId WHERE d.domainName NOT like '%www.%';",
      []
    );
  }

  public loadByIds(churchId: string, ids: string[]) {
    const sql = "SELECT * FROM `domains` WHERE churchId=? AND id IN (" + ids.join(",") + ") ORDER by name";
    return TypedDB.query(sql, [churchId]);
  }

  protected rowToModel(row: any): Domain {
    return {
      id: row.id,
      churchId: row.churchId,
      domainName: row.domainName
    };
  }
}
