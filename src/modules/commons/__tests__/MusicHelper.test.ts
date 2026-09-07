import { MusicHelper } from "../helpers/MusicHelper";

// Minimal format-0 SMF: one track, one note-on/note-off pair per pitch.
function midi(pitches: number[]): Buffer {
  const events: number[] = [];
  for (const n of pitches) events.push(0x00, 0x90, n, 0x40, 0x60, 0x80, n, 0x00);
  events.push(0x00, 0xff, 0x2f, 0x00);
  const track = Buffer.from(events);
  const head = Buffer.alloc(14);
  head.write("MThd", 0, "latin1");
  head.writeUInt32BE(6, 4);
  head.writeUInt16BE(0, 8); // format 0
  head.writeUInt16BE(1, 10); // one track
  head.writeUInt16BE(480, 12); // ticks per beat
  const chunk = Buffer.alloc(8);
  chunk.write("MTrk", 0, "latin1");
  chunk.writeUInt32BE(track.length, 4);
  return Buffer.concat([head, chunk, track]);
}

const C_MAJOR_SCALE = [
  60, 62, 64, 65, 67, 69, 71, 72
];
const transpose = (pitches: number[], semis: number) => pitches.map((n) => n + semis);

describe("MusicHelper.pitchClasses", () => {
  it("counts note-ons per pitch class and ignores note-offs and meta events", () => {
    expect(MusicHelper.pitchClasses(midi(C_MAJOR_SCALE))).toEqual([
      2, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1
    ]);
  });

  it("returns an empty histogram for bytes that are not a MIDI file", () => {
    expect(MusicHelper.pitchClasses(Buffer.from("X:1\nK:G\n"))).toEqual(new Array(12).fill(0));
  });
});

describe("MusicHelper.midiKeyRoot", () => {
  it("estimates the tonic of a scale", () => {
    expect(MusicHelper.midiKeyRoot(midi(C_MAJOR_SCALE))).toBe("C");
  });

  it("follows a transposition", () => {
    expect(MusicHelper.midiKeyRoot(midi(transpose(C_MAJOR_SCALE, 3)))).toBe("Eb");
    expect(MusicHelper.midiKeyRoot(midi(transpose(C_MAJOR_SCALE, 7)))).toBe("G");
  });

  it("declines to guess from too few notes or unreadable bytes", () => {
    expect(MusicHelper.midiKeyRoot(midi([60, 62, 64]))).toBe("");
    expect(MusicHelper.midiKeyRoot(Buffer.from("not a midi file"))).toBe("");
    expect(MusicHelper.midiKeyRoot(Buffer.alloc(0))).toBe("");
  });
});

describe("MusicHelper key roots", () => {
  it("reads the ABC K: header, including a mode suffix", () => {
    expect(MusicHelper.abcKeyRoot("X:1\nT:Hymn\nM:4/4\nK:Eb\nCDEF|")).toBe("Eb");
    expect(MusicHelper.abcKeyRoot("X:1\nK:F#min\n")).toBe("F#");
    expect(MusicHelper.abcKeyRoot("X:1\nM:3/4\n")).toBe("");
  });

  it("reads the ChordPro {key:} directive", () => {
    expect(MusicHelper.chordProKeyRoot("{title: Hymn}\n{key: Bb}\n\nVerse 1\n[Bb]Sing")).toBe("Bb");
    expect(MusicHelper.chordProKeyRoot("Verse 1\n[G]Sing")).toBe("");
  });

  it("strips the mode off a stated key", () => {
    expect(MusicHelper.keyRoot(" Ebm ")).toBe("Eb");
    expect(MusicHelper.keyRoot("F#m7")).toBe("F#");
    expect(MusicHelper.keyRoot("")).toBe("");
  });

  it("compares roots enharmonically", () => {
    expect(MusicHelper.sameRoot("D#", "Eb")).toBe(true);
    expect(MusicHelper.sameRoot("Gm", "G")).toBe(true);
    expect(MusicHelper.sameRoot("D", "Eb")).toBe(false);
    expect(MusicHelper.sameRoot("", "C")).toBe(false);
  });
});
