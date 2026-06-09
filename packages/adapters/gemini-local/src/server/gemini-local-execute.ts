/**
 * execute.ts — Core execution logic untuk gemini_local adapter
 *
 * Setiap heartbeat Paperclip memanggil fungsi execute() ini.
 * Alurnya:
 *   1. Build prompt dari task context + session handoff notes
 *   2. Spawn `gemini` CLI dengan --output-format stream-json
 *   3. Parse JSONL output line-by-line
 *   4. Return teks respons + token usage ke Paperclip
 *
 * NOTE: Gemini CLI mendukung --resume untuk session persistence.
 * Jika sessionId tersimpan dan cwd tidak berubah, resume digunakan.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type {
  AdapterExecuteInput,
  AdapterExecuteOutput,
} from "@paperclipai/adapter-utils";

interface GeminiConfig {
  model?: string;
  workingDirectory?: string;
  timeoutSec?: number;
  promptTemplate?: string;
  maxTurns?: number;
}

interface GeminiJsonlEvent {
  type?: string;
  content?: string;
  text?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Baca session ID yang tersimpan untuk resume.
 * Session disimpan per (agentId + cwd) supaya tidak salah resume.
 */
function readSessionId(
  paperclipHome: string,
  agentId: string,
  cwd: string
): string | undefined {
  try {
    const key = Buffer.from(`${agentId}:${cwd}`).toString("base64url");
    const sessionFile = path.join(
      paperclipHome,
      "gemini-sessions",
      `${key}.txt`
    );
    if (fs.existsSync(sessionFile)) {
      return fs.readFileSync(sessionFile, "utf-8").trim() || undefined;
    }
  } catch {
    // abaikan error baca session
  }
  return undefined;
}

/**
 * Simpan session ID untuk heartbeat berikutnya.
 */
function writeSessionId(
  paperclipHome: string,
  agentId: string,
  cwd: string,
  sessionId: string
): void {
  try {
    const key = Buffer.from(`${agentId}:${cwd}`).toString("base64url");
    const sessionsDir = path.join(paperclipHome, "gemini-sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionFile = path.join(sessionsDir, `${key}.txt`);
    fs.writeFileSync(sessionFile, sessionId, "utf-8");
  } catch {
    // abaikan error tulis session
  }
}

/**
 * Parse JSONL output dari Gemini CLI --output-format stream-json
 */
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
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event: GeminiJsonlEvent = JSON.parse(trimmed);

      // Content / text event
      if (event.content) text += event.content;
      if (event.text) text += event.text;

      // Usage event
      if (event.usage) {
        inputTokens +=
          event.usage.inputTokens ?? event.usage.input_tokens ?? 0;
        outputTokens +=
          event.usage.outputTokens ?? event.usage.output_tokens ?? 0;
      }

      // Session ID (beberapa versi Gemini CLI emit ini)
      const rawEvent = event as Record<string, unknown>;
      if (typeof rawEvent["sessionId"] === "string") {
        sessionId = rawEvent["sessionId"];
      }
    } catch {
      // Baris non-JSON dilewati
    }
  }

  return { text: text.trim(), sessionId, inputTokens, outputTokens };
}

/**
 * Main execute function — dipanggil Paperclip setiap heartbeat.
 */
export async function execute(
  input: AdapterExecuteInput
): Promise<AdapterExecuteOutput> {
  const config: GeminiConfig =
    (input.agentConfig as GeminiConfig | undefined) ?? {};

  const model = config.model ?? "gemini-2.5-flash";
  const timeoutMs = (config.timeoutSec ?? 300) * 1000;
  const maxTurns = config.maxTurns ?? 1;

  // Resolve working directory
  const cwd = config.workingDirectory
    ? path.resolve(config.workingDirectory)
    : process.cwd();
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
  }

  // Build prompt
  const templateVars: Record<string, string> = {
    task: input.task?.description ?? "",
    goal: input.task?.goalDescription ?? "",
    context: input.sessionHandoffNotes ?? "",
    agentName: input.agent?.name ?? "Agent",
  };

  let prompt =
    config.promptTemplate ??
    `You are {{agentName}}, an autonomous AI agent managed by Paperclip.\n\nGoal: {{goal}}\n\nTask: {{task}}\n\nContext from last session:\n{{context}}\n\nWork on the task and report your progress.`;

  for (const [k, v] of Object.entries(templateVars)) {
    prompt = prompt.replaceAll(`{{${k}}}`, v);
  }

  // Check session untuk resume
  const paperclipHome = process.env["PAPERCLIP_HOME"] ?? "/paperclip";
  const agentId = input.agent?.id ?? "unknown";
  const existingSession = readSessionId(paperclipHome, agentId, cwd);

  // Build args
  const args: string[] = [
    "--output-format",
    "stream-json",
    "--model",
    model,
    "--max-turns",
    String(maxTurns),
    "--yolo", // non-interactive / dangerously-skip-permissions equivalent
  ];

  if (existingSession) {
    args.push("--resume", existingSession);
  }

  args.push("--prompt", prompt);

  // Spawn Gemini CLI
  return new Promise((resolve, reject) => {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      reject(
        new Error(
          "GEMINI_API_KEY tidak ditemukan. Set di Railway Dashboard → Variables."
        )
      );
      return;
    }

    const proc = spawn("gemini", args, {
      cwd,
      env: {
        ...process.env,
        GEMINI_API_KEY: apiKey,
        HOME: process.env["HOME"] ?? "/paperclip",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(
        new Error(
          `Gemini CLI timeout setelah ${config.timeoutSec ?? 300} detik`
        )
      );
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0 && !stdout) {
        reject(
          new Error(
            `Gemini CLI keluar dengan kode ${code}. stderr: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }

      const parsed = parseGeminiJsonl(stdout);

      // Simpan session ID baru jika ada
      if (parsed.sessionId) {
        writeSessionId(paperclipHome, agentId, cwd, parsed.sessionId);
      }

      resolve({
        response: parsed.text || stderr.trim() || "(Tidak ada respons dari Gemini)",
        tokenUsage: {
          inputTokens: parsed.inputTokens,
          outputTokens: parsed.outputTokens,
        },
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Gagal spawn gemini CLI: ${err.message}. Pastikan @google/gemini-cli sudah terinstall.`
        )
      );
    });
  });
}
