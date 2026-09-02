import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Submission } from "../models/index.js";

export interface QueueFilter {
  status?: string;
  assetType?: string;
  page?: number;
  pageSize?: number;
}

/** Queue rows carry the joined asset columns the admin list needs. */
export interface QueueRow extends Submission {
  assetType?: string;
  assetName?: string;
  assetStatus?: string;
  publisherUserId?: string;
  publishedSubmissionId?: string;
}

const parseJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

function fromRow<T extends Submission>(row: any): T {
  if (!row) return row;
  return { ...row, payload: parseJson(row.payload) || {}, filesChanged: row.filesChanged ? parseJson(row.filesChanged) : undefined };
}

@injectable()
export class SubmissionRepo {
  public async create(sub: Submission): Promise<Submission> {
    sub.id = UniqueIdHelper.shortId();
    sub.status = "draft";
    await getDb().insertInto("submissions").values({
      id: sub.id,
      assetId: sub.assetId,
      submittedBy: sub.submittedBy,
      status: "draft",
      payload: JSON.stringify(sub.payload || {}),
      note: sub.note
    } as any).execute();
    return sub;
  }

  public async loadById(id: string): Promise<Submission | undefined> {
    return fromRow(await getDb().selectFrom("submissions").selectAll().where("id", "=", id).executeTakeFirst());
  }

  public async loadMine(userId: string, status?: string): Promise<QueueRow[]> {
    let q = this.joined().where("submissions.submittedBy", "=", userId);
    if (status) q = q.where("submissions.status", "=", status);
    return (await q.orderBy("submissions.createdAt", "desc").execute()).map((r) => fromRow<QueueRow>(r));
  }

  public async loadByAsset(assetId: string, statuses?: string[]): Promise<Submission[]> {
    let q = getDb().selectFrom("submissions").selectAll().where("assetId", "=", assetId);
    if (statuses?.length) q = q.where("status", "in", statuses);
    return (await q.orderBy("createdAt", "asc").execute()).map((r) => fromRow(r));
  }

  public async loadPendingForAsset(assetId: string): Promise<Submission | undefined> {
    return fromRow(await getDb().selectFrom("submissions").selectAll().where("assetId", "=", assetId).where("status", "=", "pending").executeTakeFirst());
  }

  /** The one moderation queue: pending submissions across every product, oldest first. */
  public async loadQueue(filter: QueueFilter): Promise<QueueRow[]> {
    const pageSize = Math.min(Math.max(filter.pageSize || 100, 1), 500);
    const page = Math.max(filter.page || 1, 1);
    let q = this.joined().where("submissions.status", "=", filter.status || "pending");
    if (filter.assetType) q = q.where("assets.assetType", "=", filter.assetType);
    const rows = await q.orderBy("submissions.submittedAt", "asc").orderBy("submissions.createdAt", "asc").limit(pageSize).offset((page - 1) * pageSize).execute();
    return rows.map((r) => fromRow<QueueRow>(r));
  }

  public async loadHistory(assetId: string): Promise<Submission[]> {
    return (await getDb().selectFrom("submissions").selectAll().where("assetId", "=", assetId).where("status", "=", "approved")
      .orderBy("reviewedAt", "asc").orderBy("createdAt", "asc").execute()).map((r) => fromRow(r));
  }

  public async countApproved(assetId: string): Promise<number> {
    const row = await getDb().selectFrom("submissions").select(sql<number>`count(*)`.as("n")).where("assetId", "=", assetId).where("status", "=", "approved").executeTakeFirst();
    return Number(row?.n || 0);
  }

  public async countByUser(userId: string, status: string): Promise<number> {
    const row = await getDb().selectFrom("submissions").select(sql<number>`count(*)`.as("n")).where("submittedBy", "=", userId).where("status", "=", status).executeTakeFirst();
    return Number(row?.n || 0);
  }

  public async countByStatus(status: string): Promise<number> {
    const row = await getDb().selectFrom("submissions").select(sql<number>`count(*)`.as("n")).where("status", "=", status).executeTakeFirst();
    return Number(row?.n || 0);
  }

  public async countPendingOlderThan(hours: number): Promise<number> {
    const row = await getDb().selectFrom("submissions").select(sql<number>`count(*)`.as("n")).where("status", "=", "pending")
      .where("submittedAt", "<", sql<Date>`date_sub(now(), interval ${hours} hour)`).executeTakeFirst();
    return Number(row?.n || 0);
  }

  public async countSubmittedSince(userId: string, since: Date): Promise<number> {
    const row = await getDb().selectFrom("submissions").select(sql<number>`count(*)`.as("n")).where("submittedBy", "=", userId).where("submittedAt", ">=", since).executeTakeFirst();
    return Number(row?.n || 0);
  }

  public async countSubmitterStats(userId: string): Promise<{ total: number; approved: number }> {
    const row = await getDb().selectFrom("submissions")
      .select([sql<number>`count(*)`.as("total"), sql<number>`sum(status = 'approved')`.as("approved")])
      .where("submittedBy", "=", userId).where("status", "in", ["approved", "rejected"]).executeTakeFirst();
    return { total: Number(row?.total || 0), approved: Number(row?.approved || 0) };
  }

  /** draft → pending, refused (false) when the draft is gone or another pending submission targets the asset. */
  public async submit(id: string, assetId: string, triageScore: number | null): Promise<boolean> {
    const result = await sql`update submissions set status = 'pending', submittedAt = now(), triageScore = ${triageScore}
      where id = ${id} and status = 'draft'
      and not exists (select 1 from (select 1 from submissions where assetId = ${assetId} and status = 'pending') as p)`.execute(getDb());
    return Number((result as any).numAffectedRows || 0) > 0;
  }

  public async update(id: string, fields: Partial<Submission>): Promise<void> {
    const values: any = { ...fields };
    if (fields.payload !== undefined) values.payload = JSON.stringify(fields.payload);
    if (fields.filesChanged !== undefined) values.filesChanged = JSON.stringify(fields.filesChanged);
    await getDb().updateTable("submissions").set(values).where("id", "=", id).execute();
  }

  public async delete(id: string): Promise<void> {
    await getDb().deleteFrom("submissions").where("id", "=", id).execute();
  }

  public async loadStaleDrafts(days: number): Promise<Submission[]> {
    return (await getDb().selectFrom("submissions").selectAll().where("status", "=", "draft")
      .where("createdAt", "<", sql<Date>`date_sub(now(), interval ${days} day)`).execute()).map((r) => fromRow(r));
  }

  private joined() {
    // left join: rejecting a never-published song deletes its asset, and the writer still needs to see that row on /my-songs
    return getDb().selectFrom("submissions").leftJoin("assets", "assets.id", "submissions.assetId")
      .select([
        "submissions.id",
        "submissions.assetId",
        "submissions.submittedBy",
        "submissions.status",
        "submissions.payload",
        "submissions.note",
        "submissions.triageScore",
        "submissions.filesChanged",
        "submissions.reviewedBy",
        "submissions.reviewedAt",
        "submissions.reviewReason",
        "submissions.reviewNote",
        "submissions.createdAt",
        "submissions.submittedAt",
        "assets.assetType as assetType",
        sql<string>`coalesce(assets.name, json_unquote(json_extract(submissions.payload, '$.name')))`.as("assetName"),
        "assets.status as assetStatus",
        "assets.publisherUserId as publisherUserId",
        "assets.publishedSubmissionId as publishedSubmissionId"
      ]);
  }
}
