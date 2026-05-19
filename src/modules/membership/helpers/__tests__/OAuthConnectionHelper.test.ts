import { toConnections } from "../OAuthConnectionHelper.js";

const now = new Date("2026-05-19T00:00:00Z");
const future = new Date("2026-08-01T00:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");

describe("toConnections", () => {
  it("returns an empty array for empty/absent input", () => {
    expect(toConnections([], now)).toEqual([]);
    expect(toConnections(undefined as any, now)).toEqual([]);
  });

  it("maps a live token row to a connection", () => {
    const conn = { id: "tok1", clientId: "cid1", clientName: "Zapier", scopes: "people:read", createdAt: past, expiresAt: future };
    expect(toConnections([conn], now)).toEqual([conn]);
  });

  it("drops tokens whose refresh window has already expired", () => {
    const rows = [
      { id: "live", clientId: "c", clientName: "A", scopes: "", createdAt: past, expiresAt: future },
      { id: "dead", clientId: "c", clientName: "B", scopes: "", createdAt: past, expiresAt: past }
    ];
    expect(toConnections(rows, now).map((c) => c.id)).toEqual(["live"]);
  });

  it("falls back to clientId when the client name is missing", () => {
    const rows = [{ id: "t", clientId: "cid-xyz", clientName: null, scopes: null, createdAt: past, expiresAt: future }];
    const result = toConnections(rows, now);
    expect(result[0].clientName).toBe("cid-xyz");
    expect(result[0].scopes).toBe("");
  });
});
