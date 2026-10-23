# Nuno Alumínios — aplicação de orçamentos
# Compatível com o builder clássico do Docker (sem BuildKit).

# ---- Fase 1: dependências de produção (compila módulos nativos se necessário)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# ---- Fase 2: runner leve (o PDF é gerado em JavaScript: não precisa de browser)
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=3100 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY assets ./assets
COPY scripts ./scripts
RUN chmod +x scripts/entrypoint.sh
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node", "src/server.js"]
