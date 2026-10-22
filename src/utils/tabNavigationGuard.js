import { detectPlatform } from "./platforms.js";

export const isTabNavigationComplete = (tabUrl, platform, tabStatus) => {
  if (tabStatus !== "complete") return false;
  if (!tabUrl || tabUrl === "about:blank") return false;
  return detectPlatform(tabUrl) === platform;
};
