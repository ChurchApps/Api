jest.mock("@churchapps/apihelper", () => ({
  EnvironmentBase: class {
    static async initBase() { return { appName: "API" }; }
  },
  AwsHelper: { readParameter: jest.fn().mockResolvedValue("") }
}));

import { Environment } from "../Environment.js";

const SAMPLE_JWT = "jwt-secret-dev";
const SAMPLE_ENCRYPTION = "aSecretKeyOfExactly192BitsLength";
const VALID_JWT = "a-production-jwt-secret-32chars-min";
const VALID_ENCRYPTION = "a-production-encryption-key";

describe("Environment.init secret checks", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    ["JWT_SECRET", "ENCRYPTION_KEY", "GOCURRICULUM_CLIENT_SECRET", "GOOGLE_DRIVE_CLIENT_SECRET", "ONEDRIVE_CLIENT_SECRET"].forEach((key) => { saved[key] = process.env[key]; });
    process.env.GOCURRICULUM_CLIENT_SECRET = "x";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "x";
    process.env.ONEDRIVE_CLIENT_SECRET = "x";
    jest.spyOn(Environment as any, "initBase").mockResolvedValue({ appName: "API" });
    jest.spyOn(Environment as any, "initializeDatabaseConnections").mockResolvedValue(undefined);
    jest.spyOn(Environment as any, "initializeAppConfigs").mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.keys(saved).forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
    jest.restoreAllMocks();
  });

  it("throws in prod on the sample JWT_SECRET", async () => {
    process.env.JWT_SECRET = SAMPLE_JWT;
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION;
    await expect(Environment.init("prod")).rejects.toThrow(/JWT_SECRET/);
  });

  it("throws in staging on the sample JWT_SECRET", async () => {
    process.env.JWT_SECRET = SAMPLE_JWT;
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION;
    await expect(Environment.init("staging")).rejects.toThrow(/JWT_SECRET/);
  });

  it("throws in prod on empty JWT_SECRET", async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION;
    await expect(Environment.init("prod")).rejects.toThrow(/JWT_SECRET/);
  });

  it("throws in staging on empty JWT_SECRET", async () => {
    process.env.JWT_SECRET = "";
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION;
    await expect(Environment.init("staging")).rejects.toThrow(/JWT_SECRET/);
  });

  it("throws in prod when JWT_SECRET is shorter than 32 characters", async () => {
    process.env.JWT_SECRET = "too-short-to-be-safe";
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION;
    await expect(Environment.init("prod")).rejects.toThrow(/JWT_SECRET/);
  });

  it("throws in prod on the sample ENCRYPTION_KEY", async () => {
    process.env.JWT_SECRET = VALID_JWT;
    process.env.ENCRYPTION_KEY = SAMPLE_ENCRYPTION;
    await expect(Environment.init("prod")).rejects.toThrow(/ENCRYPTION_KEY/);
  });

  it("throws in staging on empty ENCRYPTION_KEY", async () => {
    process.env.JWT_SECRET = VALID_JWT;
    delete process.env.ENCRYPTION_KEY;
    await expect(Environment.init("staging")).rejects.toThrow(/ENCRYPTION_KEY/);
  });

  it("accepts the sample secrets in dev", async () => {
    process.env.JWT_SECRET = SAMPLE_JWT;
    process.env.ENCRYPTION_KEY = SAMPLE_ENCRYPTION;
    await expect(Environment.init("dev")).resolves.toBeUndefined();
    expect(Environment.jwtSecret).toBe(SAMPLE_JWT);
    expect(Environment.encryptionKey).toBe(SAMPLE_ENCRYPTION);
  });

  it("accepts the sample secrets in docker", async () => {
    process.env.JWT_SECRET = SAMPLE_JWT;
    process.env.ENCRYPTION_KEY = SAMPLE_ENCRYPTION;
    await expect(Environment.init("docker")).resolves.toBeUndefined();
  });
});
