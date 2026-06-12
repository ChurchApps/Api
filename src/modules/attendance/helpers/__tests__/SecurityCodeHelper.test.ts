import { SecurityCodeHelper } from "../SecurityCodeHelper.js";

describe("SecurityCodeHelper.generate", () => {
  it("produces 4-char codes from the unambiguous no-vowel alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = SecurityCodeHelper.generate();
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[23456789BCDFGHJKLMNPQRSTVWXYZ]{4}$/);
      expect(code).not.toMatch(/[AEIOU01]/);
    }
  });
});
