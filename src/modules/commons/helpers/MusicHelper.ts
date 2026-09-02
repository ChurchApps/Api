// Key sanity checks for uploaded tunes. Ported from the WorshipCommons site — the SMF reader is
// midiPlayer.ts stripped to what a pitch-class histogram needs (no tempo map, no note pairing), and
// the note/key spelling comes from chordpro.ts + abc.ts. Advisory only: nothing here ever blocks a
// submission, it just gives a reviewer a heads-up when a file disagrees with the stated key.

const SHARP = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];
const FLAT = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"
];
// display spelling matches the site's key picker (KEY_CHOICES in chordpro.ts)
const KEY_NAMES = [
  "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"
];

// Krumhansl-Kessler probe-tone profiles; the estimate is the best-correlating of the 24 rotations.
const MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88
];
const MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17
];

// fewer notes than this and the correlation is noise, not a key
const MIN_NOTES = 8;

const noteIndex = (n: string): number => {
  const i = SHARP.indexOf(n);
  return i >= 0 ? i : FLAT.indexOf(n);
};

const correlate = (hist: number[], profile: number[], rot: number): number => {
  const x = hist.map((_v, i) => hist[(i + rot) % 12]);
  const mx = x.reduce((a, b) => a + b, 0) / 12;
  const mp = profile.reduce((a, b) => a + b, 0) / 12;
  let num = 0;
  let dx = 0;
  let dp = 0;
  for (let i = 0; i < 12; i++) {
    const a = x[i] - mx;
    const b = profile[i] - mp;
    num += a * b;
    dx += a * a;
    dp += b * b;
  }
  return dx > 0 && dp > 0 ? num / Math.sqrt(dx * dp) : 0;
};

export class MusicHelper {
  /** Note-on counts per pitch class from a Standard MIDI File; all zeros when the bytes are not a SMF. */
  static pitchClasses(buf: Buffer): number[] {
    const hist = new Array(12).fill(0);
    let pos = 0;
    const str = (n: number) => {
      const s = buf.toString("latin1", pos, pos + n);
      pos += n;
      return s;
    };
    const readVar = () => {
      let v = 0;
      let b = 0;
      do {
        b = buf[pos++] || 0;
        v = (v << 7) | (b & 0x7f);
      } while (b & 0x80);
      return v;
    };
    if (buf.length < 14 || str(4) !== "MThd") return hist;
    pos += 4 + 2; // header length + format
    const ntrks = buf.readUInt16BE(pos);
    pos += 2 + 2; // track count + ticks per beat
    for (let tr = 0; tr < ntrks && pos + 8 <= buf.length; tr++) {
      if (str(4) !== "MTrk") break;
      const end = Math.min(pos + 4 + buf.readUInt32BE(pos), buf.length);
      pos += 4;
      let status = 0;
      while (pos < end) {
        readVar(); // delta time
        let b = buf[pos];
        if (b & 0x80) {
          status = b;
          pos++;
        } else b = status;
        if (b === 0xff) {
          pos++; // meta type
          pos += readVar();
        } else if (b === 0xf0 || b === 0xf7) {
          pos += readVar();
        } else {
          const kind = b & 0xf0;
          const d1 = buf[pos++];
          const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : buf[pos++];
          if (kind === 0x90 && d2 > 0) hist[d1 % 12]++;
        }
      }
      pos = end;
    }
    return hist;
  }

  /** Estimated key root of a MIDI tune ("Eb"), or "" when it cannot be read or is too short to judge. */
  static midiKeyRoot(buf: Buffer): string {
    let hist: number[];
    try {
      hist = this.pitchClasses(buf);
    } catch {
      return "";
    }
    if (hist.reduce((a, b) => a + b, 0) < MIN_NOTES) return "";
    let best = -Infinity;
    let root = 0;
    for (let r = 0; r < 12; r++) {
      for (const profile of [MAJOR, MINOR]) {
        const c = correlate(hist, profile, r);
        if (c > best) {
          best = c;
          root = r;
        }
      }
    }
    return KEY_NAMES[root];
  }

  /** The engraved key of an ABC score — its K: header root. */
  static abcKeyRoot(abc: string): string {
    return (abc || "").match(/^K:\s*([A-G][#b]?)/m)?.[1] || "";
  }

  /** The chart key a ChordPro body declares with {key: ...}, if it declares one. */
  static chordProKeyRoot(chordPro: string): string {
    return (chordPro || "").match(/\{\s*key\s*:\s*([A-G][#b]?)/i)?.[1] || "";
  }

  /** "Ebm" / "F#m7" → "Eb" / "F#"; "" when there is no readable root. */
  static keyRoot(key: string): string {
    return (key || "").trim().match(/^([A-G][#b]?)/)?.[1] || "";
  }

  /** Enharmonic comparison — D# and Eb are the same root. */
  static sameRoot(a: string, b: string): boolean {
    const x = noteIndex(this.keyRoot(a));
    const y = noteIndex(this.keyRoot(b));
    return x >= 0 && x === y;
  }
}
