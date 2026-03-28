FROM oven/bun:1.3-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src/ ./src/

RUN mkdir -p /app/data

ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
