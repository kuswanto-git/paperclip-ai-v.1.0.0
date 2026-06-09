/**
 * server/index.ts — Factory untuk gemini_local server adapter
 *
 * Dipanggil oleh Paperclip server untuk mendapatkan instance adapter.
 */

import type { ServerAdapter } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { test } from "./test.js";
import { metadata } from "../index.js";

export function createServerAdapter(): ServerAdapter {
  return {
    metadata,
    execute,
    test,
  };
}
