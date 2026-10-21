export declare const evaluateContentHistoryImageWait: (params: {
  hasAnyImage: boolean;
  lastImageLoaded: boolean;
  hasTextOnlyWarning?: boolean;
  hasCompletedTextReply?: boolean;
}) => {
  shouldWait: boolean;
  reason: string;
};
