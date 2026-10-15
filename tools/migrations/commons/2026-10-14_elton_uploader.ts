import { type Kysely } from "kysely";

// Elton Smith (Songs of Praise) already publishes his other larry-holder songs under this account,
// including The Ballad of the Cross. These three co-writes were imported with no uploader, so the
// account that may translate them was never recorded. A publisher already set is left alone.
const ELTON = "squlbh74qTW";
const SONGS = ["hj-aPXXi8jv", "2FCCvjupEKe", "5clFeniLcRf"];

export async function up(db: Kysely<any>): Promise<void> {
  await db.updateTable("assets").set({ publisherUserId: ELTON }).where("id", "in", SONGS).where("publisherUserId", "is", null).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.updateTable("assets").set({ publisherUserId: null }).where("id", "in", SONGS).where("publisherUserId", "=", ELTON).execute();
}
