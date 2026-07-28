FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY apps/pos-integration-service/package.json apps/pos-integration-service/package.json
COPY libs/shared-types/package.json libs/shared-types/package.json

RUN npm ci

FROM deps AS build
COPY apps/pos-integration-service apps/pos-integration-service
COPY libs/shared-types libs/shared-types

RUN npm run build --workspace @reclaimai/shared-types \
 && npm run build --workspace @reclaimai/pos-integration-service \
 && npm prune --omit=dev --workspaces --include-workspace-root=false

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/pos-integration-service/package.json ./apps/pos-integration-service/package.json
COPY --from=build /app/apps/pos-integration-service/dist ./apps/pos-integration-service/dist
COPY --from=build /app/libs/shared-types/package.json ./libs/shared-types/package.json
COPY --from=build /app/libs/shared-types/dist ./libs/shared-types/dist

WORKDIR /app/apps/pos-integration-service

EXPOSE 3002

CMD ["node", "dist/main.js"]
