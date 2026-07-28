FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY apps/dashboard-web/package.json apps/dashboard-web/package.json
COPY libs/shared-types/package.json libs/shared-types/package.json
COPY libs/ui-components/package.json libs/ui-components/package.json

RUN npm ci

FROM deps AS build
WORKDIR /app

ARG NEXT_PUBLIC_BASE_PATH=/dashboard
ARG NEXT_PUBLIC_TENANT_AUTH_URL=/api/tenant-auth
ARG NEXT_PUBLIC_AUTH_DEV_BYPASS=false
ARG NEXT_PUBLIC_AUTH0_DOMAIN=
ARG NEXT_PUBLIC_AUTH0_CLIENT_ID=
ARG NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.reclaimai.demo
ARG NEXT_PUBLIC_AUTH0_CALLBACK_URL=

ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_TENANT_AUTH_URL=$NEXT_PUBLIC_TENANT_AUTH_URL
ENV NEXT_PUBLIC_AUTH_DEV_BYPASS=$NEXT_PUBLIC_AUTH_DEV_BYPASS
ENV NEXT_PUBLIC_AUTH0_DOMAIN=$NEXT_PUBLIC_AUTH0_DOMAIN
ENV NEXT_PUBLIC_AUTH0_CLIENT_ID=$NEXT_PUBLIC_AUTH0_CLIENT_ID
ENV NEXT_PUBLIC_AUTH0_AUDIENCE=$NEXT_PUBLIC_AUTH0_AUDIENCE
ENV NEXT_PUBLIC_AUTH0_CALLBACK_URL=$NEXT_PUBLIC_AUTH0_CALLBACK_URL

COPY apps/dashboard-web apps/dashboard-web
COPY libs/shared-types libs/shared-types
COPY libs/ui-components libs/ui-components

RUN npm run build --workspace @reclaimai/shared-types \
 && npm run build --workspace @reclaimai/ui-components \
 && npm run build --workspace @reclaimai/dashboard-web

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/dashboard-web/.next/standalone ./
COPY --from=build /app/apps/dashboard-web/.next/static ./apps/dashboard-web/.next/static

EXPOSE 3100

CMD ["node", "server.js"]
