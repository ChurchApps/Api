jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index.js", () => ({ DateHelper: { toMysqlDate: (d: unknown) => d } }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { FormRepo } from "../FormRepo.js";
import { getDb } from "../../db/index.js";

interface SelectChain {
  selectAll: () => SelectChain;
  where: (col: string, op: string, val: unknown) => SelectChain;
  orderBy: () => SelectChain;
  execute: () => Promise<unknown[]>;
}

describe("FormRepo conversational-flag round-trip", () => {
  const repo = new FormRepo();

  it("maps the new conversational columns from a db row to the model", () => {
    const row = {
      id: "f1",
      churchId: "ch1",
      name: "Connect Card",
      contentType: "form",
      restricted: false,
      archived: false,
      thankYouMessage: "Thanks!",
      displayMode: "conversational",
      autoCreatePerson: true,
      followUpSubject: "Welcome {firstName}",
      followUpBody: "<p>Hi {firstName} from {churchName}</p>"
    };
    const model = repo.convertToModel("ch1", row);
    expect(model.displayMode).toBe("conversational");
    expect(model.autoCreatePerson).toBe(true);
    expect(model.followUpSubject).toBe("Welcome {firstName}");
    expect(model.followUpBody).toBe("<p>Hi {firstName} from {churchName}</p>");
  });

  it("defaults are preserved when columns are absent/false", () => {
    const model = repo.convertToModel("ch1", { id: "f2", churchId: "ch1", displayMode: "standard", autoCreatePerson: false });
    expect(model.displayMode).toBe("standard");
    expect(model.autoCreatePerson).toBe(false);
    expect(model.followUpSubject).toBeUndefined();
  });
});

describe("FormRepo description round-trip", () => {
  const repo = new FormRepo();

  it("maps the description column from a db row to the model", () => {
    const model = repo.convertToModel("ch1", { id: "f3", churchId: "ch1", name: "Camp Signup", description: "Tell us about your camper." });
    expect(model.description).toBe("Tell us about your camper.");
  });

  it("writes description on create and update", async () => {
    const inserted: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const insertChain = { values: (v: Record<string, unknown>) => { inserted.push(v); return { execute: async (): Promise<undefined> => undefined }; } };
    const updateChain = { set: (v: Record<string, unknown>) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async (): Promise<undefined> => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ insertInto: () => insertChain, updateTable: () => updateChain });

    await repo.save({ churchId: "ch1", name: "Camp Signup", contentType: "form", description: "Intro copy" });
    await repo.save({ id: "f3", churchId: "ch1", name: "Camp Signup", contentType: "form", description: "Updated intro" });

    expect(inserted[0].description).toBe("Intro copy");
    expect(updated[0].description).toBe("Updated intro");
  });
});

describe("FormRepo.loadByIds and submission history", () => {
  const repo = new FormRepo();

  it("does not filter out archived forms", async () => {
    // Issue #1067: PersonController.appendFormSubmissions hydrates a person's
    // submission history through loadByIds and drops any submission whose form
    // is missing. Filtering archived here erased the history of every archived
    // form from the person record and the person export.
    const wheres: [string, string, unknown][] = [];
    const chain: SelectChain = {
      selectAll: () => chain,
      where: (col: string, op: string, val: unknown) => { wheres.push([col, op, val]); return chain; },
      orderBy: () => chain,
      execute: async () => []
    };
    (getDb as jest.Mock).mockReturnValue({ selectFrom: () => chain });

    await repo.loadByIds("ch1", ["f1", "f2"]);

    expect(wheres.map((w) => w[0])).toEqual(expect.arrayContaining(["churchId", "removed", "id"]));
    expect(wheres.map((w) => w[0])).not.toContain("archived");
  });
});

describe("FormRepo header photo round-trip", () => {
  const repo = new FormRepo();

  it("maps the photoUrl column from a db row to the model", () => {
    const model = repo.convertToModel("ch1", { id: "f4", churchId: "ch1", name: "Summer Camp", photoUrl: "https://example.com/camp.jpg" });
    expect(model.photoUrl).toBe("https://example.com/camp.jpg");
  });

  it("writes photoUrl on create and clears it on update", async () => {
    const inserted: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const insertChain = { values: (v: Record<string, unknown>) => { inserted.push(v); return { execute: async (): Promise<undefined> => undefined }; } };
    const updateChain = { set: (v: Record<string, unknown>) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async (): Promise<undefined> => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ insertInto: () => insertChain, updateTable: () => updateChain });

    await repo.save({ churchId: "ch1", name: "Summer Camp", contentType: "form", photoUrl: "https://example.com/camp.jpg" });
    await repo.save({ id: "f4", churchId: "ch1", name: "Summer Camp", contentType: "form", photoUrl: "" });

    expect(inserted[0].photoUrl).toBe("https://example.com/camp.jpg");
    expect(updated[0]).toHaveProperty("photoUrl", null);
  });
});
