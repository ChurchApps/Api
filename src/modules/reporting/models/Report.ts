import { Query } from "./Query.js";
import { Parameter } from "./Parameter.js";
import { Output } from "./Output.js";
import { PermissionGroup } from "./PermissionGroup.js";

export class Report {
  public displayName?: string;
  public description?: string;
  public queries?: Query[];
  public parameters?: Parameter[];
  public outputs?: Output[];
  public permissions?: PermissionGroup[];
}
