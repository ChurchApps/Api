import { ReportRepository } from "./ReportRepository";

export class ReportingRepositories {
  public report: ReportRepository;
  
  constructor() {
    this.report = new ReportRepository();
  }
}