export const computeReadiness = ({ sessionMode, sessionValidation, tasksState, folderStatus }) => {
  const issues = [];
  if (sessionMode === "existing" && !sessionValidation?.ok) issues.push("session");
  if (!tasksState?.hasFile || tasksState.fatal || tasksState.issues?.length || !tasksState.tasks?.length) issues.push("prompts");
  if (folderStatus?.source?.state !== "granted") issues.push("source");
  if (folderStatus?.output?.state !== "granted") issues.push("output");
  return { ready: issues.length === 0, issues };
};
