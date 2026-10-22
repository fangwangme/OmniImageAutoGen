import type { PlatformId } from "../types.js";

export declare const isTabNavigationComplete: (
  tabUrl: string | undefined,
  platform: PlatformId,
  tabStatus: string | undefined
) => boolean;
