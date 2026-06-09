/**
 * @paperclipai/adapter-gemini-local
 * Shared metadata — diimport oleh server, UI, CLI, dan registry.
 */

export const type = "gemini_local" as const;
export const label = "Gemini (Local)";

export const models = [
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash",  label: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash",  label: "Gemini 2.0 Flash" },
  { id: "gemini-1.5-pro",    label: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash",  label: "Gemini 1.5 Flash" },
];

export const agentConfigurationDoc =
  "https://paperclip.ing/docs/adapters/gemini-local";
