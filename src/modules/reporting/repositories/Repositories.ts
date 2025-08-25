import { ReportingRepositories } from "./ReportingRepositories";

export class Repositories {
  public static getCurrent() {
    return new ReportingRepositories();
  }
}