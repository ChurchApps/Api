FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
RUN yarn build:prod && yarn workspaces focus --production

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production ENVIRONMENT=docker SELF_HOSTED=1 SERVER_PORT=8084
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY config ./config
COPY reports ./reports
RUN mkdir -p content
EXPOSE 8084
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:8084/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node dist/_migrations/tools/migrate.js --action=up --module=all && node dist/index.js"]
