export const evaluateContentHistoryImageWait = ({
  hasAnyImage,
  lastImageLoaded,
  hasTextOnlyWarning = false,
  hasCompletedTextReply = false
}) => {
  if (hasAnyImage) {
    return lastImageLoaded
      ? { shouldWait: false, reason: "last-image-loaded" }
      : { shouldWait: true, reason: "waiting-last-image-loaded" };
  }
  if (hasTextOnlyWarning) return { shouldWait: false, reason: "last-response-text-warning" };
  // A finished text-only reply will never gain an image; waiting for one would stall every later task.
  if (hasCompletedTextReply) return { shouldWait: false, reason: "last-response-text-complete" };
  return { shouldWait: true, reason: "waiting-last-image-appear" };
};
