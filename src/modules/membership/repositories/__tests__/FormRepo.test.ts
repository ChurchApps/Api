jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index.js", () => ({ DateHelper: { toMysqlDate: (d: any) => d } }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { FormRepo } from "../FormRepo.js";
import { getDb } from "../../db/index.js";

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
    const inserted: any[] = [];
    const updated: any[] = [];
    const insertChain = { values: (v: any) => { inserted.push(v); return { execute: async () => undefined }; } };
    const updateChain = { set: (v: any) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async () => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ insertInto: () => insertChain, updateTable: () => updateChain });

    await repo.save({ churchId: "ch1", name: "Camp Signup", contentType: "form", description: "Intro copy" } as any);
    await repo.save({ id: "f3", churchId: "ch1", name: "Camp Signup", contentType: "form", description: "Updated intro" } as any);

    expect(inserted[0].description).toBe("Intro copy");
    expect(updated[0].description).toBe("Updated intro");
  });
});
