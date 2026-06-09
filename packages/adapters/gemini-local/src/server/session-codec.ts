/**
 * session-codec.ts — encode/decode session state antar heartbeat
 *
 * Paperclip menyimpan sessionState sebagai opaque string di DB.
 * Kita encode/decode object { sessionId, cwd } ke/dari string JSON.
 */

export interface GeminiSessionState {
  sessionId?: string;
  cwd?: string;
}

export const sessionCodec = {
  encode(state: GeminiSessionState): string {
    return JSON.stringify(state);
  },

  decode(raw: string): GeminiSessionState {
    try {
      return JSON.parse(raw) as GeminiSessionState;
    } catch {
      return {};
    }
  },
};
