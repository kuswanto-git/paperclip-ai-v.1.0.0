/**
 * server/test.ts — Environment validation untuk gemini_local adapter
 *
 * Dipanggil dari Paperclip UI: Settings → Adapters → Test.
 * Memverifikasi:
 *   1. GEMINI_API_KEY tersedia
 *   2. gemini CLI binary bisa dieksekusi
 *   3. Koneksi ke Gemini API berhasil (hello probe)
 */

import { spawn } from "node:child_process";
import type { AdapterTestOutput } from "@paperclipai/adapter-utils";

export async function test(): Promise<AdapterTestOutput> {
  const steps: AdapterTestOutput["steps"] = [];

  // Step 1: Cek GEMINI_API_KEY
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    steps.push({
      name: "GEMINI_API_KEY",
      status: "error",
      message:
        "GEMINI_API_KEY tidak ditemukan. Set di Railway Dashboard → Variables.",
    });
    return { success: false, steps };
  }
  steps.push({
    name: "GEMINI_API_KEY",
    status: "ok",
    message: `API key ditemukan (${apiKey.slice(0, 8)}...)`,
  });

  // Step 2: Cek binary gemini
  const binaryOk = await checkBinary();
  if (!binaryOk) {
    steps.push({
      name: "Gemini CLI binary",
      status: "error",
      message:
        "Perintah `gemini` tidak ditemukan. Pastikan @google/gemini-cli terinstall global.",
    });
    return { success: false, steps };
  }
  steps.push({
    name: "Gemini CLI binary",
    status: "ok",
    message: "Binary `gemini` ditemukan di PATH",
  });

  // Step 3: Hello probe
  const probeResult = await helloProbe(apiKey);
  if (!probeResult.ok) {
    steps.push({
      name: "Gemini API probe",
      status: "error",
      message: `Probe gagal: ${probeResult.error}`,
    });
    return { success: false, steps };
  }
  steps.push({
    name: "Gemini API probe",
    status: "ok",
    message: `Respons OK: "${probeResult.text?.slice(0, 80)}..."`,
  });

  return { success: true, steps };
}

function checkBinary(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("gemini", ["--version"], { stdio: "ignore" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

function helloProbe(
  apiKey: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(
      "gemini",
      [
        "--output-format",
        "stream-json",
        "--model",
        "gemini-2.5-flash",
        "--max-turns",
        "1",
        "--yolo",
        "--prompt",
        'Respond with exactly: "Paperclip gemini_local adapter OK"',
      ],
      {
        env: { ...process.env, GEMINI_API_KEY: apiKey },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, error: "Probe timeout setelah 30 detik" });
    }, 30_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const combined = stdout + stderr;
      if (combined.toLowerCase().includes("paperclip") || combined.toLowerCase().includes("ok")) {
        resolve({ ok: true, text: combined.slice(0, 200) });
      } else if (code !== 0) {
        resolve({ ok: false, error: stderr.slice(0, 300) || `exit code ${code}` });
      } else {
        resolve({ ok: true, text: combined.slice(0, 200) || "Tidak ada output tapi exit 0" });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}
