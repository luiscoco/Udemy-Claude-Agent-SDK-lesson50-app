export const MODES = [
  "healthy",
  "badpath",
  "badstart",
  "exit",
  "invalidmodel",
  "missing",
  "structured",
  "turnlimit",
  "debug",
] as const;
export type Mode = (typeof MODES)[number];
export type RunConfig = { mode: Mode };
export type LabEvent = { type: string; [key: string]: any };
export function validateConfig(input: any): RunConfig {
  if (
    !input ||
    Object.keys(input).some((k) => k !== "mode") ||
    !MODES.includes(input.mode)
  )
    throw new Error("Choose a listed diagnostic experiment.");
  return { mode: input.mode };
}
