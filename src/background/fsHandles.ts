import { getHandle } from "../utils/idb.js";
import { platformSubdir } from "../utils/outputPath.js";
import type { PlatformId } from "../types.js";
import type { FolderStatus } from "../utils/readiness.js";

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function directoryValues(handle: FileSystemDirectoryHandle) {
  if (!handle.values) throw new Error("Directory iteration is not supported");
  return handle.values();
}

async function permittedHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getHandle<FileSystemDirectoryHandle>(key);
  if (!handle) return null;
  if (handle.queryPermission && await handle.queryPermission({ mode: "readwrite" }) !== "granted") return null;
  return handle;
}

export const getSourceHandle = () => permittedHandle("sourceHandle");
export const getOutputHandle = () => permittedHandle("outputHandle");

export async function getFolderStatus(): Promise<{ source: FolderStatus; output: FolderStatus }> {
  const status = async (key: string): Promise<FolderStatus> => {
    const handle = await getHandle<FileSystemDirectoryHandle>(key);
    if (!handle) return { state: "missing" };
    try {
      return { name: handle.name, state: handle.queryPermission ? await handle.queryPermission({ mode: "readwrite" }) : "granted" };
    } catch {
      return { name: handle.name, state: "denied" };
    }
  };
  const [source, output] = await Promise.all([status("sourceHandle"), status("outputHandle")]);
  return { source, output };
}

export async function getPlatformOutputDir(platform: PlatformId, create = false) {
  const handle = await getOutputHandle();
  if (!handle) throw new Error("Missing directory handles or permission lost");
  try {
    return await handle.getDirectoryHandle(platformSubdir(platform), { create });
  } catch (error) {
    if (!create && error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

export async function listOutputFiles(platform: PlatformId): Promise<string[]> {
  const dir = await getPlatformOutputDir(platform);
  if (!dir) return [];
  const files: string[] = [];
  for await (const entry of directoryValues(dir)) if (entry.kind === "file") files.push(entry.name);
  return files;
}

export async function checkFileExists(platform: PlatformId, filename: string): Promise<boolean> {
  const files = await listOutputFiles(platform);
  return files.some(name => name.toLowerCase() === filename.toLowerCase());
}
