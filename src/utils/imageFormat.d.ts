export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export declare const targetMimeForFilename: (name: string) => "image/png" | "image/jpeg";
export declare const targetExtLabel: (name: string) => "PNG" | "JPG";
export declare const decideSaveAction: (sourceMime: ImageMime | null, targetMime: ImageMime) => "copy" | "transcode";
export declare const sniffImageMime: (bytes: Uint8Array | ArrayBuffer) => ImageMime | null;
