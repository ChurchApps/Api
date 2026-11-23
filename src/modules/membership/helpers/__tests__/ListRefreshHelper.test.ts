import "reflect-metadata";

jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: {} }));
jest.mock("../../../../shared/modules/index", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: { fromAddress: () => "from", sendTransactional: jest.fn() } }));
jest.mock("../ListRuleHelper", () => ({ ListRuleHelper: {} }));
jest.mock("../index", () => ({
  Environment: {},
  UserHelper: { escapeHtml: (v: string) => (v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }
}));

import { ListRefreshHelper } from "../ListRefreshHelper";
import type { Repos } from "../../repositories/index.js";

describe("ListRefreshHelper.getNamesHtml", () => {
  const repos = (people: Record<string, unknown>[]) => Object.assign({} as Repos, { person: { loadByIds: jest.fn().mockResolvedValue(people) } });

  it("lists escaped display names under a heading", async () => {
    const html = await ListRefreshHelper.getNamesHtml(repos([{ displayName: "Ann <Lee>" }, { firstName: "Bo", lastName: "Kim" }]), "ch1", "Added", ["a", "b"]);
    expect(html).toBe("<h3>Added</h3><ul><li>Ann &lt;Lee&gt;</li><li>Bo Kim</li></ul>");
  });

  it("returns nothing when no one changed", async () => {
    expect(await ListRefreshHelper.getNamesHtml(repos([]), "ch1", "Removed", [])).toBe("");
  });

  it("caps the names at 100 and counts the rest", async () => {
    const ids = Array.from({ length: 130 }, (_, i) => "p" + i);
    const r = repos([{ displayName: "Someone" }]);
    const html = await ListRefreshHelper.getNamesHtml(r, "ch1", "Added", ids);
    expect(r.person.loadByIds).toHaveBeenCalledWith("ch1", ids.slice(0, 100));
    expect(html).toContain("<p>And 30 more.</p>");
  });
});
