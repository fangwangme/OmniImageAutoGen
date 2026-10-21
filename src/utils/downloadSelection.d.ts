export type DownloadEntry = { name: string; lastModified: number; size: number };
export declare const isImageFilename: (name: string) => boolean;
export declare const selectDownloadCandidate: (input: {
  entries: DownloadEntry[]; baseline: Set<string>; clickTime: number; toleranceMs?: number;
}) => DownloadEntry | null;
