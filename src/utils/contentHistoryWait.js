export const evaluateContentHistoryImageWait = ({
  hasAnyImage,
  lastImageLoaded,
  hasTextOnlyWarning = false
}) => {
  if (hasAnyImage) {
    return lastImageLoaded
      ? { shouldWait: false, reason: "last-image-loaded" }
      : { shouldWait: true, reason: "waiting-last-image-loaded" };
  }
  if (hasTextOnlyWarning) return { shouldWait: false, reason: "last-response-text-warning" };
  return { shouldWait: true, reason: "waiting-last-image-appear" };
};
