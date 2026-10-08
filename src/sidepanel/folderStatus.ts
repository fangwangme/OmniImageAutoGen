import { getHandle } from "../utils/idb.js";
import type { FolderStatus } from "../utils/readiness.js";
import type { PanelStore } from "./state.js";

export async function readFolderStatus(): Promise<{ source: FolderStatus; output: FolderStatus }> {
  return chrome.runtime.sendMessage({ action: "FOLDER_STATUS" });
}
export async function requestFolderPermission(folder: "source" | "output"): Promise<boolean> {
  const handle = await getHandle<FileSystemDirectoryHandle>(`${folder}Handle`);
  if (!handle?.requestPermission) return false;
  return await handle.requestPermission({ mode: "readwrite" }) === "granted";
}
export async function refreshFolderStatus(store: PanelStore) {
  const status = await readFolderStatus();
  if (status?.source && status?.output) store.state.folderStatus = status;
  store.render();
}
