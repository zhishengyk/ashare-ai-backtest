FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY worker ./worker
RUN node scripts/bundle.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 ALLOW_CONTAINER_BIND=1 DATA_DIR=/app/.data
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json ./package.json
COPY runtime ./runtime
COPY drizzle ./drizzle
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4317/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "runtime/server.mjs"]
