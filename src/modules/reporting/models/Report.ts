import { Query } from "./Query";
import { Parameter } from "./Parameter";
import { Output } from "./Output";
import { PermissionGroup } from "./PermissionGroup";

export class Report {
  public displayName?: string;
  public description?: string;
  public queries?: Query[];
  public parameters?: Parameter[];
  public outputs?: Output[];
  public permissions?: PermissionGroup[];
}