jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index.js", () => ({ DateHelper: { toMysqlDate: (d: any) => d } }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { FormRepo } from "../FormRepo.js";

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
