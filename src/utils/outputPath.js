import { toSafeTaskFilename } from "./taskQueue.js";
export const platformSubdir = (platform) => platform;
export const taskKey = (platform, name) => `${platform}:${toSafeTaskFilename(name).toLowerCase()}`;
