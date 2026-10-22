export const filterDisplayLogs = (logs, filter) => {
  if (filter === "issues") {
    return logs.filter(entry => entry.level === "warn" || entry.level === "error");
  }
  return logs;
};
