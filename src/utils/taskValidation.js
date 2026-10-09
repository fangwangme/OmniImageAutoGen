import { toSafeTaskFilename } from "./taskQueue.js";

const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;

export const validateTasks = (raw) => {
  if (!Array.isArray(raw)) return { fatal: "not-array" };
  const tasks = [];
  const issues = [];
  const seen = new Map();
  raw.forEach((item, offset) => {
    const index = offset + 1;
    const itemIssues = [];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ index, code: "not-object" });
      return;
    }
    if (typeof item.name !== "string") itemIssues.push({ index, code: "name-missing", field: "name" });
    else if (!item.name.trim()) itemIssues.push({ index, code: "name-empty", field: "name" });
    if (typeof item.prompt !== "string") itemIssues.push({ index, code: "prompt-missing", field: "prompt" });
    else if (!item.prompt.trim()) itemIssues.push({ index, code: "prompt-empty", field: "prompt" });
    if (typeof item.name === "string" && item.name.trim()) {
      const name = toSafeTaskFilename(item.name);
      if (RESERVED_NAMES.test(name.split(".")[0].toUpperCase())) itemIssues.push({ index, code: "name-reserved", field: "name", name });
      const key = name.toLowerCase();
      if (seen.has(key)) itemIssues.push({ index, code: "name-collision", field: "name", name, otherIndex: seen.get(key) });
      else seen.set(key, index);
    }
    issues.push(...itemIssues);
    if (itemIssues.length === 0) tasks.push({ name: item.name, prompt: item.prompt });
  });
  return { tasks, issues, total: raw.length };
};
