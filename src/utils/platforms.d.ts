import type { PlatformId } from "../types";
export type Translator = (key: string, vars?: Record<string, string | number>) => string;
export type PlatformDefinition = {
  id: PlatformId; label: string; host: string; badge: string;
  brandColor: string; conversationHint: string; defaultHome: string;
};
export type SessionValidation =
  | { ok: true; platform: PlatformId; accountPrefix: string }
  | { ok: false; code: "empty" | "invalid" | "wrong-platform" | "home" | "not-conversation"; message: string; detectedPlatform?: PlatformId | null };
export declare const PLATFORM_IDS: PlatformId[];
export declare const PLATFORMS: Record<PlatformId, PlatformDefinition>;
export declare const detectPlatform: (url?: string) => PlatformId | null;
export declare const getGeminiAccountPrefix: (url?: string) => string;
export declare const isConversationUrl: (platform: PlatformId, url?: string) => boolean;
export declare const isHomeUrl: (platform: PlatformId, url?: string) => boolean;
export declare const buildHomeUrl: (platform: PlatformId, activeTabUrl?: string) => string;
export declare const validateSessionUrl: (url: string, platform: PlatformId, t: Translator) => SessionValidation;
export declare const normalizeSessionUrl: (url: string) => string;
export declare const sessionUrlsMatch: (a: string, b: string) => boolean;
export declare const migrateLegacyState: (stored: Record<string, unknown>) => { set: Record<string, unknown>; remove: string[] };
