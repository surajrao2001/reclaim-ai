FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY apps/claim-web/package.json apps/claim-web/package.json
COPY libs/shared-types/package.json libs/shared-types/package.json
COPY libs/ui-components/package.json libs/ui-components/package.json

RUN npm ci

FROM deps AS build
WORKDIR /app

ENV NEXT_PUBLIC_IDENTITY_API_URL=/api/identity
ENV NEXT_PUBLIC_POS_API_URL=/api/pos
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

COPY apps/claim-web apps/claim-web
COPY libs/shared-types libs/shared-types
COPY libs/ui-components libs/ui-components

RUN npm run build --workspace @reclaimai/shared-types \
 && npm run build --workspace @reclaimai/ui-components \
 && npm run build --workspace @reclaimai/claim-web

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3101
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/claim-web/.next/standalone ./
COPY --from=build /app/apps/claim-web/.next/static ./apps/claim-web/.next/static

EXPOSE 3101

CMD ["node", "server.js"]
