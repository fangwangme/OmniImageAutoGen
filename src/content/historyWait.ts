import { evaluateContentHistoryImageWait } from "../utils/contentHistoryWait.js";

export const evaluateHistoryImageWait = (params: {
  hasAnyImage: boolean;
  lastImageLoaded: boolean;
  hasTextOnlyWarning?: boolean;
  hasCompletedTextReply?: boolean;
}) => evaluateContentHistoryImageWait(params);
