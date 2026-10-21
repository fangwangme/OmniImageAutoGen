export {};

declare global {
  interface FileSystemDirectoryHandle {
    requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    queryPermission?: (descriptor: { mode: "read" | "readwrite" }) =>
      | Promise<PermissionState>
      | Promise<"granted" | "denied" | "prompt">;
    values?: () => AsyncIterable<FileSystemHandle>;
  }
}
