export const canReauthorizeHandle = (state, hasHandle) => {
  return state === "prompt" && Boolean(hasHandle);
};
