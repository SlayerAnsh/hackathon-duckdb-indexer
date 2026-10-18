FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/indexer/package.json ./apps/indexer/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/demo-writer/package.json ./apps/demo-writer/package.json
RUN bun install --frozen-lockfile
COPY packages/core ./packages/core
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_TIRAMISU_RPC_URL=https://rpc.tiramisu.db-chain.testnet.arkiv.network
ENV NEXT_PUBLIC_TIRAMISU_RPC_URL=$NEXT_PUBLIC_TIRAMISU_RPC_URL
ARG NEXT_PUBLIC_EXPLORER_URL=https://tiramisu.explorer.arkiv.network
ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL
RUN bun run --cwd apps/web build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
