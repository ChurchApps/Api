import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { AbcSubmission } from "../models/index.js";

@injectable()
export class AbcSubmissionRepo {
  public async create(sub: AbcSubmission): Promise<AbcSubmission> {
    sub.id = UniqueIdHelper.shortId();
    await getDb().insertInto("abcSubmissions").values({
      id: sub.id,
      songId: sub.songId,
      abc: sub.abc,
      submittedBy: sub.submittedBy,
      status: "pending"
    } as any).execute();
    return sub;
  }

  public async loadPending(): Promise<(AbcSubmission & { songTitle: string })[]> {
    return await getDb()
      .selectFrom("abcSubmissions")
      .innerJoin("songs", "songs.id", "abcSubmissions.songId")
      .select([
        "abcSubmissions.id",
        "abcSubmissions.songId",
        "abcSubmissions.abc",
        "abcSubmissions.submittedBy",
        "abcSubmissions.createdAt",
        "songs.title as songTitle"
      ])
      .where("abcSubmissions.status", "=", "pending")
      .orderBy("abcSubmissions.createdAt", "asc")
      .execute() as (AbcSubmission & { songTitle: string })[];
  }

  public async updateStatus(id: string, status: string): Promise<void> {
    await getDb().updateTable("abcSubmissions").set({ status } as any).where("id", "=", id).execute();
  }
}
