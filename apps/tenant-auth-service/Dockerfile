FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY apps/tenant-auth-service/package.json apps/tenant-auth-service/package.json
COPY libs/shared-types/package.json libs/shared-types/package.json
COPY libs/shared-auth/package.json libs/shared-auth/package.json

RUN npm ci

FROM deps AS build
COPY apps/tenant-auth-service apps/tenant-auth-service
COPY libs/shared-types libs/shared-types
COPY libs/shared-auth libs/shared-auth

RUN npm run build --workspace @reclaimai/shared-types \
 && npm run build --workspace @reclaimai/shared-auth \
 && npm run build --workspace @reclaimai/tenant-auth-service \
 && npm prune --omit=dev --workspaces --include-workspace-root=false

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/tenant-auth-service/package.json ./apps/tenant-auth-service/package.json
COPY --from=build /app/apps/tenant-auth-service/dist ./apps/tenant-auth-service/dist
COPY --from=build /app/libs/shared-types/package.json ./libs/shared-types/package.json
COPY --from=build /app/libs/shared-types/dist ./libs/shared-types/dist
COPY --from=build /app/libs/shared-auth/package.json ./libs/shared-auth/package.json
COPY --from=build /app/libs/shared-auth/dist ./libs/shared-auth/dist

WORKDIR /app/apps/tenant-auth-service

EXPOSE 3001

CMD ["node", "dist/main.js"]
