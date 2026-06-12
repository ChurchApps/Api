export class SecurityCodeHelper {
  // No vowels or ambiguous chars (0/O, 1/I) — matches B1Checkin's LabelHelper alphabet.
  static readonly alphabet = "23456789BCDFGHJKLMNPQRSTVWXYZ";

  static generate(length = 4): string {
    let result = "";
    for (let i = 0; i < length; i++) result += this.alphabet[Math.floor(Math.random() * this.alphabet.length)];
    return result;
  }
}
