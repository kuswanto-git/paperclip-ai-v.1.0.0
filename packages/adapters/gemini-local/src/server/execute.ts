/**
 * execute.ts — Core execution logic gemini_local adapter
 *
 * Dipanggil Paperclip setiap heartbeat agent.
 * Spawn gemini CLI → parse JSONL output → return ke Paperclip.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GeminiSessionState } from "./session-codec.js";

// ── Tipe minimal yang digunakan dari adapter-utils ─────────────────────────────
// (pakai unknown supaya tidak perlu tahu exact shape adapter-utils di fork ini)
type ExecuteContext = {
  task?: { description?: string; goalDescription?: string };
  agent?: { id?: string; name?: string; adapterConfig?: unknown };
  sessionState?: string;
};

type ExecuteResult = {
  response: string;
  sessionState?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
};

interface GeminiConfig {
  model?: string;
  workingDirectory?: string;
  timeoutSec?: number;
  promptTemplate?: string;
  maxTurns?: number;
}

// ── Parser JSONL output Gemini CLI ────────────────────────────────────────────
function parseGeminiJsonl(raw: string): {
  text: string;
  sessionId?: string;
  inputTokens: number;
  outputTokens: number;
} {
  let text = "";
  let sessionId: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as Record<string, unknown>;
      if (typeof ev["content"] === "string") text += ev["content"];
      if (typeof ev["text"] === "string") text += ev["text"];
      if (typeof ev["sessionId"] === "string") sessionId = ev["sessionId"];
      const usage = ev["usage"] as Record<string, number> | undefined;
      if (usage) {
        inputTokens += usage["inputTokens"] ?? usage["input_tokens"] ?? 0;
        outputTokens += usage["outputTokens"] ?? usage["output_tokens"] ?? 0;
      }
    } catch { /* baris non-JSON dilewati */ }
  }

  return { text: text.trim(), sessionId, inputTokens, outputTokens };
}

// ── Main execute ──────────────────────────────────────────────────────────────
export async function execute(ctx: ExecuteContext): Promise<ExecuteResult> {
  const config = (ctx.agent?.adapterConfig ?? {}) as GeminiConfig;
  const model = config.model ?? "gemini-2.5-flash";
  const timeoutMs = (config.timeoutSec ?? 300) * 1_000;
  const maxTurns = config.maxTurns ?? 1;

  // Working directory
  const cwd = config.workingDirectory
    ? path.resolve(config.workingDirectory)
    : (process.env["PAPERCLIP_HOME"] ?? "/paperclip") + "/workspaces/" + (ctx.agent?.id ?? "default");
  fs.mkdirSync(cwd, { recursive: true });

  // Decode session state
  let prevSession: GeminiSessionState = {};
  if (ctx.sessionState) {
    try { prevSession = JSON.parse(ctx.sessionState) as GeminiSessionState; } catch { /**/ }
  }
  const resumeId = prevSession.cwd === cwd ? prevSession.sessionId : undefined;

  // Build prompt
  let prompt = config.promptTemplate ??
    `You are {{agentName}}, an AI agent managed by Paperclip.\n\nCompany goal: {{goal}}\n\nTask: {{task}}\n\nWork on the task and report your progress clearly.`;
  prompt = prompt
    .replaceAll("{{agentName}}", ctx.agent?.name ?? "Agent")
    .replaceAll("{{goal}}", ctx.task?.goalDescription ?? "")
    .replaceAll("{{task}}", ctx.task?.description ?? "");

  // Build CLI args
  const args = [
    "--output-format", "stream-json",
    "--model", model,
    "--max-turns", String(maxTurns),
    "--yolo",
  ];
  if (resumeId) args.push("--resume", resumeId);
  args.push("--prompt", prompt);

  // Spawn
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY tidak ditemukan. Set di Railway Dashboard → Variables.");

  return new Promise((resolve, reject) => {
    const proc = spawn("gemini", args, {
      cwd,
      env: { ...process.env, GEMINI_API_KEY: apiKey },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Gemini CLI timeout setelah ${config.timeoutSec ?? 300}s`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) {
        reject(new Error(`Gemini CLI exit ${code}. stderr: ${stderr.slice(0, 500)}`));
        return;
      }

      const parsed = parseGeminiJsonl(stdout);
      const newSession: GeminiSessionState = {
        sessionId: parsed.sessionId ?? resumeId,
        cwd,
      };

      resolve({
        response: parsed.text || stderr.trim() || "(Tidak ada respons)",
        sessionState: JSON.stringify(newSession),
        tokenUsage: { inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens },
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Gagal spawn gemini: ${err.message}. Pastikan @google/gemini-cli terinstall.`));
    });
  });
}
