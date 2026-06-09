/**
 * server/index.ts — re-export semua yang dibutuhkan registry.ts
 *
 * registry.ts mengimport:
 *   import { execute, testEnvironment, sessionCodec } from "@paperclipai/adapter-gemini-local/server"
 */

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { sessionCodec } from "./session-codec.js";
