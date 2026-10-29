const env = { jwtSecret: "test-secret", captchaEnforce: true };
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: env }));

import { CaptchaPass } from "../CaptchaPass";

const req = (captchaPass?: string): any => ({ body: captchaPass === undefined ? {} : { captchaPass } });

beforeEach(() => {
  env.captchaEnforce = true;
  jest.useRealTimers();
});

describe("CaptchaPass", () => {
  it("accepts a fresh pass for the same church", () => {
    expect(CaptchaPass.verify(req(CaptchaPass.create("CHU1")), "CHU1")).toBe(true);
  });

  it("accepts a pass issued without a church for any church", () => {
    expect(CaptchaPass.verify(req(CaptchaPass.create()), "CHU2")).toBe(true);
  });

  it("rejects a missing pass", () => {
    expect(CaptchaPass.verify(req(), "CHU1")).toBe(false);
    expect(CaptchaPass.verify(req(""), "CHU1")).toBe(false);
  });

  it("rejects a tampered pass", () => {
    const [body, sig] = CaptchaPass.create("CHU1").split(".");
    const forged = Buffer.from(JSON.stringify({ p: "give", c: "CHU1", exp: 9999999999 })).toString("base64url");
    expect(CaptchaPass.verify(req(`${forged}.${sig}`), "CHU1")).toBe(false);
    expect(CaptchaPass.verify(req(`${body}.x${sig.slice(1)}`), "CHU1")).toBe(false);
    expect(CaptchaPass.verify(req("garbage"), "CHU1")).toBe(false);
  });

  it("rejects a pass for another church", () => {
    expect(CaptchaPass.verify(req(CaptchaPass.create("CHU1")), "CHU2")).toBe(false);
  });

  it("rejects an expired pass", () => {
    jest.useFakeTimers({ now: Date.now() - (CaptchaPass.ttlSeconds + 5) * 1000 });
    const old = CaptchaPass.create("CHU1");
    jest.useRealTimers();
    expect(CaptchaPass.verify(req(old), "CHU1")).toBe(false);
  });

  it("lets everything through while enforcement is off", () => {
    env.captchaEnforce = false;
    expect(CaptchaPass.verify(req(), "CHU1")).toBe(true);
  });
});
