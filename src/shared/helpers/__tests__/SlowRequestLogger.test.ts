import express from "express";
import { AddressInfo } from "net";
import { Server } from "http";
import { slowRequestLogger } from "../SlowRequestLogger";

describe("slowRequestLogger", () => {
  let server: Server;
  let baseUrl: string;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    const app = express();
    app.use(slowRequestLogger);
    const router = express.Router();
    router.get("/people/:id", (_req, res) => { setTimeout(() => res.json({ ok: true }), 60); });
    router.get("/fast/:id", (_req, res) => { res.json({ ok: true }); });
    app.use("/membership", router);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    process.env.SLOW_REQUEST_MS = "50";
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.SLOW_REQUEST_MS;
  });

  const slowLines = () => logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("SLOW "));

  const waitForFinish = () => new Promise((resolve) => setImmediate(resolve));

  it("logs one line with the route pattern for a slow request", async () => {
    await fetch(`${baseUrl}/membership/people/PER123abc?search=secret`);
    await waitForFinish();
    const lines = slowLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^SLOW GET \/membership\/people\/:id 200 \d+ms$/);
  });

  it("never logs the concrete id or the query string", async () => {
    await fetch(`${baseUrl}/membership/people/PER123abc?search=secret`);
    await waitForFinish();
    const all = logSpy.mock.calls.flat().map(String).join("\n");
    expect(all).not.toContain("PER123abc");
    expect(all).not.toContain("secret");
  });

  it("logs nothing for a fast request", async () => {
    process.env.SLOW_REQUEST_MS = "5000";
    await fetch(`${baseUrl}/membership/fast/PER123abc`);
    await fetch(`${baseUrl}/membership/people/PER123abc`);
    await waitForFinish();
    expect(slowLines()).toHaveLength(0);
  });

  it("uses a placeholder for requests that match no route", async () => {
    process.env.SLOW_REQUEST_MS = "1";
    const app = express();
    app.use(slowRequestLogger);
    app.use((_req, res) => { setTimeout(() => res.status(404).end(), 5); });
    const s: Server = await new Promise((resolve) => { const x = app.listen(0, () => resolve(x)); });
    await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/nope/PER123abc`);
    await waitForFinish();
    await new Promise((resolve) => s.close(resolve));
    expect(slowLines()).toEqual([expect.stringMatching(/^SLOW GET <unmatched> 404 \d+ms$/)]);
  });
});
