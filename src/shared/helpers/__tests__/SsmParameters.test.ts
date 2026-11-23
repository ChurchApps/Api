jest.mock("@churchapps/apihelper", () => ({ AwsHelper: { readParameter: jest.fn().mockResolvedValue("") } }));

import { GetParametersCommand } from "@aws-sdk/client-ssm";
import { readSsmParameters } from "../SsmParameters.js";

const names = ["/prod/a", "/prod/b"];

describe("readSsmParameters", () => {
  it("reads every name in one call and blanks the missing ones", async () => {
    const send = jest.fn().mockResolvedValue({ Parameters: [{ Name: "/prod/a", Value: "A" }] });
    const result = await readSsmParameters(names, send, { baseDelayMs: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0][0] as GetParametersCommand).input.Names).toEqual(names);
    expect(result).toEqual({ "/prod/a": "A", "/prod/b": "" });
  });

  it("retries a throttled call and then succeeds", async () => {
    const throttle = Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" });
    const send = jest.fn()
      .mockRejectedValueOnce(throttle)
      .mockRejectedValueOnce(throttle)
      .mockResolvedValue({ Parameters: [{ Name: "/prod/a", Value: "A" }, { Name: "/prod/b", Value: "B" }] });
    const result = await readSsmParameters(names, send, { baseDelayMs: 0 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ "/prod/a": "A", "/prod/b": "B" });
  });

  it("gives up after the configured attempts, logs the names, and returns blanks", async () => {
    const send = jest.fn().mockRejectedValue(Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" }));
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await readSsmParameters(names, send, { attempts: 3, baseDelayMs: 0 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ "/prod/a": "", "/prod/b": "" });
    expect(log.mock.calls[0][0]).toContain("/prod/a, /prod/b");
    log.mockRestore();
  });

  it("falls back to one read per name when GetParameters is denied", async () => {
    const send = jest.fn().mockRejectedValue(Object.assign(new Error("not authorized"), { name: "AccessDeniedException" }));
    const readOne = jest.fn(async (name: string) => name.toUpperCase());
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await readSsmParameters(names, send, { baseDelayMs: 0, readOne });
    expect(send).toHaveBeenCalledTimes(1);
    expect(readOne).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ "/prod/a": "/PROD/A", "/prod/b": "/PROD/B" });
    warn.mockRestore();
  });

  it("makes no call when there is nothing to read", async () => {
    const send = jest.fn();
    expect(await readSsmParameters([], send)).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });
});
