import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Report } from "../models/index.js";

@injectable()
export class ReportRepo {
  public async create(report: Report): Promise<Report> {
    report.id = UniqueIdHelper.shortId();
    await getDb().insertInto("reports").values({
      id: report.id,
      contentType: report.contentType || "song",
      contentId: report.contentId,
      contentText: report.contentText,
      reporterRole: report.reporterRole,
      details: report.details,
      name: report.name,
      email: report.email,
      signature: report.signature,
      status: "open"
    } as any).execute();
    return report;
  }

  public async loadOpen(): Promise<Report[]> {
    return await getDb().selectFrom("reports").selectAll().where("status", "=", "open").orderBy("createdAt", "asc").execute() as Report[];
  }

  public async updateStatus(id: string, status: string): Promise<void> {
    await getDb().updateTable("reports").set({ status } as any).where("id", "=", id).execute();
  }
}
