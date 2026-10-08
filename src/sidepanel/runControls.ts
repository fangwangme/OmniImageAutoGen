import type { createTaskLifecycle } from "./taskLifecycle.js";
type Runtime = ReturnType<typeof createTaskLifecycle>;
export function bindStopControl(button: HTMLButtonElement | null, runtime: Runtime) {
  if (!button) return;
  const listener = () => { void runtime.stop(); };
  button.addEventListener("click", listener);
  return () => button.removeEventListener("click", listener);
}
export function bindResetControl(button: HTMLButtonElement | null, runtime: Runtime) {
  if (!button) return;
  const listener = () => { void runtime.reset(); };
  button.addEventListener("click", listener);
  return () => button.removeEventListener("click", listener);
}
