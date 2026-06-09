FROM node:lts-trixie-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# ─── deps stage ────────────────────────────────────────────────────────────────
FROM base AS deps

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Core packages
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/

# Adapters — DITAMBAHKAN: gemini-local
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/

RUN pnpm install --frozen-lockfile

# ─── build stage ───────────────────────────────────────────────────────────────
FROM base AS build

WORKDIR /app
COPY --from=deps /app /app
COPY . .

# Build UI
RUN pnpm --filter @paperclipai/ui build

# Build shared packages
RUN pnpm --filter @paperclipai/shared build || true
RUN pnpm --filter @paperclipai/db build || true

# ─── production stage ──────────────────────────────────────────────────────────
FROM base AS production

WORKDIR /app
COPY --from=build /app /app

# Install global CLI tools:
#   - tsx          : runtime transpiler untuk server TypeScript
#   - claude-code  : adapter claude-local
#   - codex        : adapter codex-local
#   - opencode-ai  : adapter opencode-local
#   - gemini-cli   : adapter gemini-local (DITAMBAHKAN)
RUN npm install --global --omit=dev \
      tsx \
      @anthropic-ai/claude-code@latest \
      @openai/codex@latest \
      opencode-ai \
      @google/gemini-cli \
  && mkdir -p /paperclip/instances/default /workspaces

# Copy meta-engine-workspace (agent instructions, templates, idea sources)
COPY meta-engine-workspace /meta-engine-workspace

# Buat non-root user supaya claude --dangerously-skip-permissions bisa jalan
RUN useradd -m -s /bin/bash paperclip \
  && chown -R paperclip:paperclip /paperclip /workspaces /meta-engine-workspace /app

USER paperclip

# ─── environment defaults ──────────────────────────────────────────────────────
ENV NODE_ENV=production \
    HOME=/paperclip \
    HOST=0.0.0.0 \
    PORT=3100 \
    SERVE_UI=true \
    PAPERCLIP_HOME=/paperclip \
    PAPERCLIP_INSTANCE_ID=default \
    PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
    PAPERCLIP_DEPLOYMENT_MODE=authenticated \
    PAPERCLIP_DEPLOYMENT_EXPOSURE=private

# Railway volumes dikonfigurasi via dashboard, bukan Dockerfile
# VOLUME ["/paperclip"]

EXPOSE 3100

CMD ["tsx", "server/src/index.ts"]
