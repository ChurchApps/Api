export const MAX_FILE_BYTES = 26214400;

export const ASSET_LICENSES = ["CC0", "CC-BY", "WC"];

/** True when a demo file is attached but the writer did not confirm ownership. */
export function demoOwnershipMissing(body: {
  files?: { demoAudio?: { base64?: string } };
  recordingOwned?: boolean;
  demoOwned?: boolean;
}): boolean {
  const hasDemo = !!body.files?.demoAudio?.base64;
  const owned = !!(body.recordingOwned || body.demoOwned);
  return hasDemo && !owned;
}

/** Returns the first blocking problem with an asset submission, or null when it is acceptable. */
export function assetSubmitError(body: { assetType?: string; name?: string; license?: string; file?: { base64?: string } }, byteLength: number): string | null {
  if (!body.assetType || !body.name) return "assetType and name are required";
  if (!ASSET_LICENSES.includes(body.license || "")) return `license must be one of: ${ASSET_LICENSES.join(", ")}`;
  if (!body.file?.base64) return "a file is required";
  if (byteLength === 0) return "the uploaded file is empty";
  if (byteLength > MAX_FILE_BYTES) return "the uploaded file exceeds the 25MB limit";
  return null;
}
