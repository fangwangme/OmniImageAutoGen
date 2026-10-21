export const targetMimeForFilename = (name) => /\.jpe?g$/i.test(name) ? "image/jpeg" : "image/png";
export const targetExtLabel = (name) => /\.jpe?g$/i.test(name) ? "JPG" : "PNG";
export const decideSaveAction = (sourceMime, targetMime) => sourceMime === targetMime ? "copy" : "transcode";

export const sniffImageMime = (bytes) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return "image/webp";
  return null;
};
