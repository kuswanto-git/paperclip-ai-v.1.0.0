export type TranscriptEntry =
  | { type: "assistant"; text: string }
  | { type: "tool_use"; name: string; input?: unknown }
  | { type: "tool_result"; content: string }
  | { type: "system"; text: string };

export function parseStdoutLine(line: string): TranscriptEntry | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const ev = JSON.parse(t) as Record<string, unknown>;
    const content = (ev["content"] ?? ev["text"] ?? "") as string;
    if (content) return { type: "assistant", text: content };
  } catch { /**/ }
  return null;
}
