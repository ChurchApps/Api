import { ASSET_TYPES as BASE_ASSET_TYPES, AssetDetailField, AssetFileRole, AssetTypeDefinition } from "@churchapps/helpers";

// ponytail: @churchapps/helpers owns ASSET_TYPES. Until the package ships these roles and fields, the
// commons module extends the song entry here; the upgrade path is to move them into
// Packages/helpers/src/interfaces/Commons.ts and delete this file. fileRole() needs no override —
// score.*, scoreImage.* and lyrics.* all resolve to their basename.
const MB = 1048576;

const SONG_FILES: AssetFileRole[] = [
  { role: "score", namePattern: "score.{ext}", extensions: ["musicxml", "xml", "mxl", "mscz", "ly"], maxBytes: 25 * MB },
  { role: "scoreImage", namePattern: "scoreImage.{ext}", extensions: ["pdf", "png", "jpg", "jpeg", "tif"], maxBytes: 25 * MB },
  // lyrics.chordpro is the chart generated on publish, so ChordPro text uploads travel as lyrics.cho
  { role: "lyrics", namePattern: "lyrics.{ext}", extensions: ["cho", "crd", "txt"], maxBytes: MB },
  // the finished mix: a second rights layer (detail.masterLicense) that unlocks stems and a full mix; demoAudio stays a writer demo
  { role: "master", namePattern: "master.{ext}", extensions: ["wav", "mp3", "m4a", "flac", "ogg"], maxBytes: 90 * MB }
];

const SONG_DETAIL_FIELDS: AssetDetailField[] = [
  { key: "parentSongId", label: "Original song", type: "text", maxLength: 32 },
  { key: "relationLabel", label: "Relation to the original", type: "text", maxLength: 60 },
  { key: "translator", label: "Translator", type: "text", maxLength: 120 },
  { key: "arranger", label: "Arranger", type: "text", maxLength: 120 },
  // checked against def.licenses in SubmitValidation once a master file is present: the uploadable set is the registry's
  { key: "masterLicense", label: "Master recording license", type: "text", maxLength: 16 }
];

// a master is a recording too: the same ownership attestation the demo needs
const MASTER_ATTESTATION = { key: "recordingOwned", label: "This recording is mine (or I have the owner's permission to share it).", requiredWhenRole: "master" };

function extendSong(def: AssetTypeDefinition): AssetTypeDefinition {
  const roles = new Set(SONG_FILES.map((f) => f.role));
  const kept = def.files.filter((f) => !roles.has(f.role));
  const firstGenerated = kept.findIndex((f) => f.generated);
  const files = firstGenerated < 0 ? [...kept, ...SONG_FILES] : [...kept.slice(0, firstGenerated), ...SONG_FILES, ...kept.slice(firstGenerated)];
  const keys = new Set(SONG_DETAIL_FIELDS.map((f) => f.key));
  const detailFields = [...(def.detailFields || []).filter((f) => !keys.has(f.key)), ...SONG_DETAIL_FIELDS];
  const attestations = [...(def.attestations || []).filter((a) => a.requiredWhenRole !== "master"), MASTER_ATTESTATION];
  return { ...def, files, detailFields, attestations, maxTotalBytes: Math.max(def.maxTotalBytes, 200 * MB) };
}

export const ASSET_TYPES: Record<string, AssetTypeDefinition> = { ...BASE_ASSET_TYPES, song: extendSong(BASE_ASSET_TYPES.song) };
