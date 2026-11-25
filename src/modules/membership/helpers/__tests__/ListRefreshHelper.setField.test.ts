import "reflect-metadata";

const setPersonFieldMock = jest.fn();
const getPeopleIdsMock = jest.fn();
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: {} }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ setPersonField: setPersonFieldMock }), getDoingModuleGateway: () => ({}) }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../ListRuleHelper", () => ({ ListRuleHelper: { getPeopleIds: (...args: unknown[]) => getPeopleIdsMock(...args) } }));
jest.mock("../index", () => ({ Environment: {}, UserHelper: {} }));

import { ListRefreshHelper } from "../ListRefreshHelper.js";
import type { Repos } from "../../repositories/index.js";
import type { List } from "../../models/index.js";

// A saved list's setField action goes through the same gateway call as the workflow step action,
// so "personField_<fieldId>" sets a custom field here too.
describe("ListRefreshHelper setField action", () => {
  const list: List = { id: "l1", churchId: "c1", name: "New members", actions: [{ type: "setField", field: "personField_f1", value: "True" }] };
  const repos = () => Object.assign({} as Repos, {
    listMember: { loadPersonIds: jest.fn().mockResolvedValue(["p1"]), addPersonIds: jest.fn(), removePersonIds: jest.fn() },
    person: { loadByIds: jest.fn().mockResolvedValue([{ id: "p2" }, { id: "p3" }]) }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getPeopleIdsMock.mockResolvedValue(["p1", "p2", "p3"]);
  });

  it("sets the custom field on each newly added person", async () => {
    setPersonFieldMock.mockResolvedValue(undefined);
    const r = repos();
    await ListRefreshHelper.refreshList(r, list);
    expect(r.person.loadByIds).toHaveBeenCalledWith("c1", ["p2", "p3"]);
    expect(setPersonFieldMock.mock.calls).toEqual([["c1", "p2", "personField_f1", "True"], ["c1", "p3", "personField_f1", "True"]]);
  });

  it("finishes the refresh when the field has since been deleted", async () => {
    setPersonFieldMock.mockRejectedValue(new Error("Invalid person field: personField_f1"));
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await ListRefreshHelper.refreshList(repos(), list);
    expect(result).toEqual({ added: ["p2", "p3"], removed: [] });
    expect(setPersonFieldMock).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });
});
