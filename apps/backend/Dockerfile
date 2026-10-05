FROM node:22-slim
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @attendance/backend... \
 && pnpm --filter @attendance/backend build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @attendance/backend db:deploy && pnpm --filter @attendance/backend start"]
