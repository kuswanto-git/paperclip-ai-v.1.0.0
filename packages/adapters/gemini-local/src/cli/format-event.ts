/**
 * format-event.ts — Format output Gemini CLI untuk terminal (paperclipai run --watch)
 */

export function formatStdoutEvent(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const ev = JSON.parse(t) as Record<string, unknown>;
    const content = (ev["content"] ?? ev["text"] ?? "") as string;
    if (content) return content;
  } catch { /**/ }
  return null;
}
