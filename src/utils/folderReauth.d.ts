import type { FolderStatus } from "./readiness.js";

export declare const canReauthorizeHandle: (
  state: FolderStatus["state"],
  hasHandle: boolean
) => boolean;
