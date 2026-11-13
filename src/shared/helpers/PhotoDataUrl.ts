// Photos arrive as base64 data URLs; these checks cap the decoded size and the image type.
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export class PhotoDataUrl {
  static isAcceptable(dataUrl: unknown, pngOnly = false): boolean {
    if (typeof dataUrl !== "string") return false;
    const match = (pngOnly ? /^data:image\/png;base64,/ : /^data:image\/(png|jpeg|jpg|webp);base64,/i).exec(dataUrl);
    if (!match) return false;
    return (dataUrl.length - match[0].length) * 0.75 <= MAX_PHOTO_BYTES;
  }
}
