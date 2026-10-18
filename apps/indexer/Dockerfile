FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/indexer/package.json ./apps/indexer/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/demo-writer/package.json ./apps/demo-writer/package.json
RUN bun install --frozen-lockfile --production
COPY packages/core ./packages/core
COPY apps/indexer ./apps/indexer
ENV DATA_DIR=/data
ENV PORT=8080
CMD ["bun", "apps/indexer/src/main.ts"]
