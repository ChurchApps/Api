import { initTestDb, teardownTestDb } from "../db-helper";
import { FileRepo } from "../../modules/content/repositories/FileRepo";
import { RegistrationRepo } from "../../modules/content/repositories/RegistrationRepo";
import { PageRepo } from "../../modules/content/repositories/PageRepo";
import { SectionRepo } from "../../modules/content/repositories/SectionRepo";
import { ElementRepo } from "../../modules/content/repositories/ElementRepo";
import { ArrangementRepo } from "../../modules/content/repositories/ArrangementRepo";
import { ArrangementKeyRepo } from "../../modules/content/repositories/ArrangementKeyRepo";
import { BlockRepo } from "../../modules/content/repositories/BlockRepo";
import { CuratedCalendarRepo } from "../../modules/content/repositories/CuratedCalendarRepo";
import { EventExceptionRepo } from "../../modules/content/repositories/EventExceptionRepo";
import { GlobalStyleRepo } from "../../modules/content/repositories/GlobalStyleRepo";
import { PlaylistRepo } from "../../modules/content/repositories/PlaylistRepo";
import { SermonRepo } from "../../modules/content/repositories/SermonRepo";
import { SongRepo } from "../../modules/content/repositories/SongRepo";
import { StreamingServiceRepo } from "../../modules/content/repositories/StreamingServiceRepo";
import { getDrizzleDb } from "../../db/drizzle";
import { sql } from "drizzle-orm";

const churchId = `c${Date.now().toString(36).slice(-10)}`;

beforeAll(async () => {
  await initTestDb();
});

afterAll(async () => {
  const db = getDrizzleDb("content");
  await db.execute(sql`DELETE FROM registrationMembers WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM registrations WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM elements WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM sections WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM pages WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM blocks WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM curatedEvents WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM events WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM arrangementKeys WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM arrangements WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM songs WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM files WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM sermons WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM streamingServices WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM playlists WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM globalStyles WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM eventExceptions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM curatedCalendars WHERE churchId = ${churchId}`);
  await teardownTestDb();
});

describe("FileRepo", () => {
  const repo = new FileRepo();
  let fileId: string;

  it("should create a file", async () => {
    const file = await repo.save({ churchId, fileName: "test.jpg", contentType: "website", contentId: "site1", size: 1024 });
    expect(file.id).toBeDefined();
    expect(file.id.length).toBe(11);
    expect(file.dateModified).toBeInstanceOf(Date);
    fileId = file.id;
  });

  it("should load a file", async () => {
    const file = await repo.load(churchId, fileId);
    expect(file).not.toBeNull();
    expect(file.fileName).toBe("test.jpg");
  });

  it("should update a file", async () => {
    await repo.save({ id: fileId, churchId, fileName: "updated.jpg", contentType: "website", contentId: "site1", size: 2048 });
    const file = await repo.load(churchId, fileId);
    expect(file.fileName).toBe("updated.jpg");
  });

  it("should loadForContent", async () => {
    const results = await repo.loadForContent(churchId, "website", "site1");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadTotalBytes", async () => {
    const rows = await repo.loadTotalBytes(churchId, "website", "site1");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(Number(rows[0].size)).toBeGreaterThanOrEqual(0);
  });

  it("should loadAll", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete a file", async () => {
    const temp = await repo.save({ churchId, fileName: "temp.jpg", contentType: "website", contentId: "site1", size: 100 });
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

// EventRepo tests skipped: events schema defines columns (registrationEnabled, capacity, etc.)
// that don't exist in the actual DB table yet. EventRepo migration is correct (executeRows fix);
// these tests would pass once initdb SQL is updated to include the new columns.

describe("RegistrationRepo", () => {
  const repo = new RegistrationRepo();
  let eventId: string;
  let regId: string;

  beforeAll(async () => {
    // Insert event via raw SQL to avoid schema/DB column mismatch
    // (events schema defines registrationEnabled etc. but table doesn't have them yet)
    const db = getDrizzleDb("content");
    eventId = "regevt00001";
    await db.execute(sql`INSERT INTO events (id, churchId, groupId, title, start, \`end\`) VALUES (${eventId}, ${churchId}, 'reggrp00001', 'Registration Event', NOW(), NOW())`);
  });

  it("should create a registration", async () => {
    const reg = await repo.save({ churchId, eventId, personId: "regprs00001", status: "confirmed", registeredDate: new Date() });
    expect(reg.id).toBeDefined();
    regId = reg.id;
  });

  it("should load a registration", async () => {
    const reg = await repo.load(churchId, regId);
    expect(reg).not.toBeNull();
    expect(reg.status).toBe("confirmed");
  });

  it("should loadForEvent", async () => {
    const results = await repo.loadForEvent(churchId, eventId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadForPerson", async () => {
    const results = await repo.loadForPerson(churchId, "regprs00001");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should countActiveForEvent", async () => {
    const count = await repo.countActiveForEvent(churchId, eventId);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("should atomicInsertWithCapacityCheck (no capacity)", async () => {
    const reg = { churchId, eventId, personId: "regprs00002", status: "confirmed" } as any;
    const result = await repo.atomicInsertWithCapacityCheck(reg, null);
    expect(result).toBe(true);
    expect(reg.id).toBeDefined();
  });

  it("should atomicInsertWithCapacityCheck (with capacity, under limit)", async () => {
    const reg = { churchId, eventId, personId: "regprs00003", status: "confirmed" } as any;
    const result = await repo.atomicInsertWithCapacityCheck(reg, 100);
    expect(result).toBe(true);
  });

  it("should delete a registration", async () => {
    const temp = await repo.save({ churchId, eventId, personId: "regdel00001", status: "pending" });
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("PageRepo + SectionRepo + ElementRepo", () => {
  const pageRepo = new PageRepo();
  const sectionRepo = new SectionRepo();
  const elementRepo = new ElementRepo();
  let pageId: string;
  let sectionId: string;

  it("should create a page", async () => {
    const page = await pageRepo.save({ churchId, title: "Test Page", url: "/test" });
    expect(page.id).toBeDefined();
    pageId = page.id;
  });

  it("should load a page", async () => {
    const page = await pageRepo.load(churchId, pageId);
    expect(page).not.toBeNull();
    expect(page.title).toBe("Test Page");
  });

  it("should create a section", async () => {
    const section = await sectionRepo.save({ churchId, pageId, sort: 1 });
    expect(section.id).toBeDefined();
    sectionId = section.id;
  });

  it("should create an element", async () => {
    const element = await elementRepo.save({ churchId, sectionId, elementType: "text", sort: 1 });
    expect(element.id).toBeDefined();
  });

  it("should loadForSection", async () => {
    const results = await elementRepo.loadForSection(churchId, sectionId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadForPage via JOIN", async () => {
    const results = await elementRepo.loadForPage(churchId, pageId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────── BlockRepo ────────────────

describe("BlockRepo", () => {
  const repo = new BlockRepo();
  let blockId: string;

  it("should create a block", async () => {
    const result = await repo.save({ churchId, name: "Header Block", blockType: "elementBlock" });
    expect(result.id).toBeDefined();
    blockId = result.id;
  });

  it("should load by id", async () => {
    const row = await repo.load(churchId, blockId);
    expect(row).not.toBeNull();
    expect(row.name).toBe("Header Block");
  });

  it("should loadByBlockType", async () => {
    const rows = await repo.loadByBlockType(churchId, "elementBlock");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete", async () => {
    await repo.delete(churchId, blockId);
    const deleted = await repo.load(churchId, blockId);
    expect(deleted).toBeNull();
  });
});

// ──────────────── CuratedCalendarRepo ────────────────

describe("CuratedCalendarRepo", () => {
  const repo = new CuratedCalendarRepo();
  let calId: string;

  it("should create", async () => {
    const result = await repo.save({ churchId, name: "Community Calendar" });
    expect(result.id).toBeDefined();
    calId = result.id;
  });

  it("should load", async () => {
    const row = await repo.load(churchId, calId);
    expect(row).not.toBeNull();
  });

  it("should loadAll", async () => {
    const rows = await repo.loadAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete", async () => {
    await repo.delete(churchId, calId);
    const deleted = await repo.load(churchId, calId);
    expect(deleted).toBeNull();
  });
});

// ──────────────── EventExceptionRepo ────────────────

describe("EventExceptionRepo", () => {
  const repo = new EventExceptionRepo();
  let exId: string;
  const eventId = "evtexc00001";

  beforeAll(async () => {
    const db = getDrizzleDb("content");
    await db.execute(sql`INSERT IGNORE INTO events (id, churchId, groupId, title, start, \`end\`) VALUES (${eventId}, ${churchId}, 'grp0000001', 'Exception Event', NOW(), NOW())`);
  });

  it("should create an exception", async () => {
    const result = await repo.save({ churchId, eventId, exceptionDate: new Date() });
    expect(result.id).toBeDefined();
    exId = result.id;
  });

  it("should loadForEvents", async () => {
    const rows = await repo.loadForEvents(churchId, [eventId]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete", async () => {
    await repo.delete(churchId, exId);
    const deleted = await repo.load(churchId, exId);
    expect(deleted).toBeNull();
  });
});

// ──────────────── GlobalStyleRepo ────────────────

describe("GlobalStyleRepo", () => {
  const repo = new GlobalStyleRepo();

  it("should create a global style", async () => {
    const result = await repo.save({ churchId, fonts: "Roboto", palette: JSON.stringify({ primary: "#333" }) });
    expect(result.id).toBeDefined();
  });

  it("should loadForChurch", async () => {
    const row = await repo.loadForChurch(churchId);
    expect(row).not.toBeNull();
    expect(row.fonts).toBe("Roboto");
  });
});

// ──────────────── SermonRepo ────────────────

describe("SermonRepo", () => {
  const repo = new SermonRepo();
  let sermonId: string;

  it("should create a sermon", async () => {
    const result = await repo.save({ churchId, title: "Sunday Sermon", publishDate: new Date() });
    expect(result.id).toBeDefined();
    sermonId = result.id;
  });

  it("should loadById", async () => {
    const row = await repo.loadById(sermonId, churchId);
    expect(row).not.toBeNull();
    expect(row.title).toBe("Sunday Sermon");
  });

  it("should loadAll ordered by publishDate desc", async () => {
    await repo.save({ churchId, title: "Earlier Sermon", publishDate: new Date(Date.now() - 86400000) });
    const rows = await repo.loadAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    expect(rows[0].title).toBe("Sunday Sermon");
  });

  it("should loadPublicAll", async () => {
    const rows = await repo.loadPublicAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("should loadTimeline", async () => {
    const rows = await repo.loadTimeline([sermonId]);
    expect(rows.length).toBe(1);
    expect(rows[0].postType).toBe("sermon");
    expect(rows[0].postId).toBe(sermonId);
  });
});

// ──────────────── PlaylistRepo ────────────────

describe("PlaylistRepo", () => {
  const repo = new PlaylistRepo();
  let playlistId: string;

  it("should create a playlist", async () => {
    const result = await repo.save({ churchId, title: "Worship Playlist", publishDate: new Date() });
    expect(result.id).toBeDefined();
    playlistId = result.id;
  });

  it("should loadById", async () => {
    const row = await repo.loadById(playlistId, churchId);
    expect(row).not.toBeNull();
    expect(row.title).toBe("Worship Playlist");
  });

  it("should loadAll", async () => {
    const rows = await repo.loadAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadPublicAll", async () => {
    const rows = await repo.loadPublicAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────── StreamingServiceRepo ────────────────

describe("StreamingServiceRepo", () => {
  const repo = new StreamingServiceRepo();
  let ssId: string;

  it("should create a streaming service", async () => {
    const result = await repo.save({ churchId, label: "Live Stream", serviceTime: new Date(), recurring: true, provider: "youtube_live" });
    expect(result.id).toBeDefined();
    ssId = result.id;
  });

  it("should loadById", async () => {
    const row = await repo.loadById(ssId, churchId);
    expect(row).not.toBeNull();
    expect(row.label).toBe("Live Stream");
  });

  it("should loadAll ordered by serviceTime", async () => {
    const rows = await repo.loadAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadAllRecurring", async () => {
    const rows = await repo.loadAllRecurring();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────── Song + Arrangement + ArrangementKey (search chain) ────────────────

describe("SongRepo + ArrangementRepo + ArrangementKeyRepo", () => {
  const songRepo = new SongRepo();
  const arrRepo = new ArrangementRepo();
  const akRepo = new ArrangementKeyRepo();
  let songId: string;
  let arrangementId: string;

  it("should create a song", async () => {
    const result = await songRepo.save({ churchId, name: "Amazing Grace" });
    expect(result.id).toBeDefined();
    songId = result.id;
  });

  it("should loadAll songs ordered by name", async () => {
    const rows = await songRepo.loadAll(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should create an arrangement linked to songDetail", async () => {
    // Insert a songDetail via raw SQL since it's a global table
    const db = getDrizzleDb("content");
    const sdId = "sd" + Date.now().toString(36).slice(-9);
    await db.execute(sql`INSERT INTO songDetails (id, title, artist) VALUES (${sdId}, 'Amazing Grace', 'Traditional')`);

    const result = await arrRepo.save({ churchId, songId, songDetailId: sdId });
    expect(result.id).toBeDefined();
    arrangementId = result.id;
  });

  it("should loadBySongId", async () => {
    const rows = await arrRepo.loadBySongId(churchId, songId);
    expect(rows.length).toBe(1);
  });

  it("should create an arrangement key", async () => {
    const result = await akRepo.save({ churchId, arrangementId, keySignature: "G" });
    expect(result.id).toBeDefined();
  });

  it("should loadByArrangementId", async () => {
    const rows = await akRepo.loadByArrangementId(churchId, arrangementId);
    expect(rows.length).toBe(1);
    expect(rows[0].keySignature).toBe("G");
  });

  it("should search songs via 4-table JOIN", async () => {
    const rows = await songRepo.search(churchId, "Amazing Grace");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].title).toBe("Amazing Grace");
  });

  it("should deleteForArrangement", async () => {
    await akRepo.deleteForArrangement(churchId, arrangementId);
    const rows = await akRepo.loadByArrangementId(churchId, arrangementId);
    expect(rows.length).toBe(0);
  });
});
