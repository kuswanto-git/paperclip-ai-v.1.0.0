/**
 * @paperclipai/adapter-gemini-local
 *
 * Adapter untuk menjalankan Google Gemini CLI secara lokal sebagai agent Paperclip.
 * Memerlukan `@google/gemini-cli` terinstall secara global (sudah dihandle Dockerfile).
 *
 * Setup:
 *  1. Set GEMINI_API_KEY di Railway Dashboard → Variables
 *  2. Buat agent baru di Paperclip UI, pilih adapter "gemini_local"
 *  3. Pilih model (gemini-2.5-pro / gemini-2.5-flash)
 */

import type { AdapterMetadata } from "@paperclipai/adapter-utils";
export { createServerAdapter } from "./server/index.js";

export const metadata: AdapterMetadata = {
  type: "gemini_local",
  label: "Gemini (Local)",
  models: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  agentConfigurationDoc:
    "https://paperclip.ing/docs/adapters/gemini-local",
};

export default metadata;
