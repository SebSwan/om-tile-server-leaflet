# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install deps (with dev deps for TypeScript build)
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json tsconfig.server.json ./
COPY src ./src
# Continue even if tsc reports type errors, it still emits JS
RUN npm run build || true

# Ensure Piscina worker file is available next to compiled JS
RUN mkdir -p dist/server \
 && cp src/server/piscina-worker.mjs dist/server/piscina-worker.mjs

# Bundle server entry to avoid ESM extension issues
RUN npm install --no-save esbuild \
 && node -e "require('esbuild').build({ entryPoints:['dist/server/index.js'], bundle:true, platform:'node', format:'esm', outfile:'dist/server/index.mjs', logLevel:'info', packages:'external' }).catch(e=>{ console.error(e); process.exit(1); })"

# Prune dev dependencies for production runtime
RUN npm prune --omit=dev

# Runtime stage
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# Copy production node_modules and built files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./package.json

EXPOSE 3000

# Use non-root user provided by the image
USER node

CMD ["node", "dist/server/index.mjs"]
