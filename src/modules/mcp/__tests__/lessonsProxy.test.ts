jest.mock("../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "test-secret", lessonsApi: "https://api.lessons.test/" } }));

import jwt from "jsonwebtoken";
import { forwardToLessons, isLessonsPath, signLessonsJwt } from "../lessonsProxy.js";
import { makeApiCallHandler } from "../tools/apiCall.js";
import { setExpressApp } from "../internalDispatch.js";
import { getRouteInventory } from "../RouteInventory.js";

const principal = {
  id: "user1",
  churchId: "church1",
  personId: "person1",
  email: "kari@example.org",
  permissions: ["LessonsApi_Schedules__Edit"],
  groupIds: ["g1"],
  leaderGroupIds: []
};

describe("MCP lessons proxy", () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async () => new Response(JSON.stringify([{ id: "c1" }]), { status: 200 }));
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it.each([
    ["/lessons/classrooms", true],
    ["/Lessons/classrooms", true],
    ["/lessons", true],
    ["/lessonsfake/x", false],
    ["/content/lessons", false]
  ])("isLessonsPath(%s) is %s", (path, expected) => {
    expect(isLessonsPath(path)).toBe(expected);
  });

  it("signs a short-lived JWT carrying the resolved principal", () => {
    const decoded: any = jwt.verify(signLessonsJwt(principal), "test-secret");
    expect(decoded).toMatchObject({ id: "user1", churchId: "church1", personId: "person1", permissions: ["LessonsApi_Schedules__Edit"] });
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it("strips the /lessons prefix and forwards query, body and auth", async () => {
    const result = await forwardToLessons({ method: "POST", path: "/lessons/schedules", query: { a: 1, b: ["x", "y"] }, body: [{ id: "s1" }], principal });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.lessons.test/schedules?a=1&b=x&b=y");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify([{ id: "s1" }]));
    const token = init.headers.Authorization.replace("Bearer ", "");
    expect((jwt.verify(token, "test-secret") as any).churchId).toBe("church1");
    expect(result).toEqual({ status: 200, body: [{ id: "c1" }], truncated: false });
  });

  it("stays on the lessons host whatever the path", async () => {
    await forwardToLessons({ method: "GET", path: "/lessons//evil.example/x", principal });
    expect(new URL(String(fetchMock.mock.calls[0][0])).host).toBe("api.lessons.test");
  });

  it("truncates bodies over 64 KB", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(70 * 1024), { status: 200 }));
    const result = await forwardToLessons({ method: "GET", path: "/lessons/classrooms", principal });
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(64 * 1024);
  });

  it("api_call sends /lessons paths to LessonsApi, not the in-process app", async () => {
    const inProcess = jest.fn((_req: any, res: any) => res.json({}));
    setExpressApp(inProcess as any);
    const handler = makeApiCallHandler(() => "Bearer cak_x.y", () => "", () => principal);
    const result: any = await handler({ method: "GET", path: "/lessons/classrooms" });
    expect(inProcess).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
  });

  it("api_call refuses /lessons paths when the session has no user", async () => {
    const handler = makeApiCallHandler(() => "Bearer x");
    const result: any = await handler({ method: "GET", path: "/lessons/classrooms" });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("api_call does not leak forward errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const handler = makeApiCallHandler(() => "Bearer x", () => "", () => principal);
    const result: any = await handler({ method: "GET", path: "/lessons/classrooms" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("10.0.0.5");
    (console.error as jest.Mock).mockRestore();
  });

  it("lists LessonsApi routes in the inventory", () => {
    const paths = getRouteInventory().map((r) => r.method + " " + r.path);
    expect(paths).toContain("GET /lessons/classrooms");
    expect(paths).toContain("POST /lessons/schedules");
  });
});
