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
      assetId: report.assetId,
      contentText: report.contentText,
      reason: report.reason || "copyright",
      reporterUserId: report.reporterUserId,
      reporterRole: report.reporterRole,
      details: report.details,
      name: report.name,
      email: report.email,
      signature: report.signature,
      status: "open"
    } as any).execute();
    return report;
  }

  public async loadById(id: string): Promise<Report | undefined> {
    return await getDb().selectFrom("reports").selectAll().where("id", "=", id).executeTakeFirst() as Report | undefined;
  }

  public async loadAll(status?: string, reason?: string): Promise<Report[]> {
    let q = getDb().selectFrom("reports").selectAll();
    if (status) q = q.where("status", "=", status);
    if (reason) q = q.where("reason", "=", reason);
    return await q.orderBy("createdAt", "asc").execute() as Report[];
  }

  public async loadByAsset(assetId: string): Promise<Report[]> {
    return await getDb().selectFrom("reports").selectAll().where("assetId", "=", assetId).orderBy("createdAt", "desc").execute() as Report[];
  }

  public async update(id: string, fields: Partial<Report>): Promise<void> {
    await getDb().updateTable("reports").set({ ...fields } as any).where("id", "=", id).execute();
  }
}
