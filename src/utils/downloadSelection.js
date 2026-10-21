export const isImageFilename = (name) => /\.(png|jpe?g|webp)$/i.test(name);

export const selectDownloadCandidate = ({ entries, baseline, clickTime, toleranceMs = 2000 }) => {
  let candidate = null;
  for (const entry of entries) {
    if (!isImageFilename(entry.name) || baseline.has(entry.name) || !(entry.lastModified >= clickTime - toleranceMs)) continue;
    if (!candidate || entry.lastModified > candidate.lastModified || (entry.lastModified === candidate.lastModified && entry.name > candidate.name)) candidate = entry;
  }
  return candidate;
};
