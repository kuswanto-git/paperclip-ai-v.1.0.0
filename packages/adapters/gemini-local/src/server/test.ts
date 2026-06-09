/**
 * test.ts — Environment validation (dipanggil dari Settings → Adapters → Test)
 */

import { spawn } from "node:child_process";

type TestStep = { name: string; status: "ok" | "warn" | "error"; message: string };
type TestResult = { success: boolean; steps: TestStep[] };

export async function testEnvironment(): Promise<TestResult> {
  const steps: TestStep[] = [];

  // 1. Cek GEMINI_API_KEY
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    steps.push({ name: "GEMINI_API_KEY", status: "error",
      message: "GEMINI_API_KEY tidak ditemukan. Set di Railway Dashboard → Variables." });
    return { success: false, steps };
  }
  steps.push({ name: "GEMINI_API_KEY", status: "ok",
    message: `Ditemukan (${apiKey.slice(0, 8)}...)` });

  // 2. Cek binary
  const binOk = await checkBinary();
  if (!binOk) {
    steps.push({ name: "gemini binary", status: "error",
      message: "Perintah `gemini` tidak ditemukan di PATH. Pastikan @google/gemini-cli terinstall global." });
    return { success: false, steps };
  }
  steps.push({ name: "gemini binary", status: "ok", message: "Binary `gemini` ditemukan" });

  // 3. Hello probe
  const probe = await helloProbe(apiKey);
  if (!probe.ok) {
    steps.push({ name: "Gemini API probe", status: "error", message: `Probe gagal: ${probe.error}` });
    return { success: false, steps };
  }
  steps.push({ name: "Gemini API probe", status: "ok",
    message: `Respons diterima: "${(probe.text ?? "").slice(0, 80)}..."` });

  return { success: true, steps };
}

function checkBinary(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("gemini", ["--version"], { stdio: "ignore" });
    p.on("close", (c) => resolve(c === 0));
    p.on("error", () => resolve(false));
    setTimeout(() => { p.kill(); resolve(false); }, 5_000);
  });
}

function helloProbe(apiKey: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const p = spawn("gemini", [
      "--output-format", "stream-json",
      "--model", "gemini-2.5-flash",
      "--max-turns", "1",
      "--yolo",
      "--prompt", 'Reply with exactly: "Paperclip gemini_local OK"',
    ], { env: { ...process.env, GEMINI_API_KEY: apiKey }, stdio: ["ignore", "pipe", "pipe"] });

    p.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    p.stderr.on("data", (c: Buffer) => { err += c.toString(); });

    const t = setTimeout(() => { p.kill(); resolve({ ok: false, error: "Timeout 30s" }); }, 30_000);
    p.on("close", (code) => {
      clearTimeout(t);
      const combined = out + err;
      if (combined.toLowerCase().includes("ok") || combined.toLowerCase().includes("paperclip")) {
        resolve({ ok: true, text: combined.slice(0, 200) });
      } else if (code !== 0) {
        resolve({ ok: false, error: err.slice(0, 300) || `exit ${code}` });
      } else {
        resolve({ ok: true, text: combined.slice(0, 200) || "exit 0" });
      }
    });
    p.on("error", (e) => { clearTimeout(t); resolve({ ok: false, error: e.message }); });
  });
}
