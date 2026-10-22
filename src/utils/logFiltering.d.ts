export type LogEntryItem = {
  level: "info" | "ok" | "warn" | "error";
  message: string;
  time?: string;
  timestamp?: number | string;
  verbose?: boolean;
  data?: unknown;
};

export declare const filterDisplayLogs: <T extends LogEntryItem>(
  logs: T[],
  filter: "all" | "issues"
) => T[];
