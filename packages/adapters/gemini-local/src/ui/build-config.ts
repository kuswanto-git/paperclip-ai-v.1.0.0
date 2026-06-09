export interface GeminiConfigValues {
  model?: string;
  workingDirectory?: string;
  timeoutSec?: number;
  promptTemplate?: string;
  maxTurns?: number;
}

export function buildAdapterConfig(values: GeminiConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (values.model) config["model"] = values.model;
  if (values.workingDirectory) config["workingDirectory"] = values.workingDirectory;
  if (values.timeoutSec) config["timeoutSec"] = values.timeoutSec;
  if (values.promptTemplate) config["promptTemplate"] = values.promptTemplate;
  if (values.maxTurns) config["maxTurns"] = values.maxTurns;
  return config;
}
