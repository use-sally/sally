FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_SALLY_VERSION=0.0.0
ARG NEXT_PUBLIC_SALLY_GIT_SHA=
ARG NEXT_PUBLIC_SALLY_BUILD_TIME=
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_SALLY_VERSION=${NEXT_PUBLIC_SALLY_VERSION}
ENV NEXT_PUBLIC_SALLY_GIT_SHA=${NEXT_PUBLIC_SALLY_GIT_SHA}
ENV NEXT_PUBLIC_SALLY_BUILD_TIME=${NEXT_PUBLIC_SALLY_BUILD_TIME}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/types packages/types

RUN pnpm --filter web build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_SALLY_VERSION=0.0.0
ARG NEXT_PUBLIC_SALLY_GIT_SHA=
ARG NEXT_PUBLIC_SALLY_BUILD_TIME=
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SALLY_VERSION=${NEXT_PUBLIC_SALLY_VERSION}
ENV NEXT_PUBLIC_SALLY_GIT_SHA=${NEXT_PUBLIC_SALLY_GIT_SHA}
ENV NEXT_PUBLIC_SALLY_BUILD_TIME=${NEXT_PUBLIC_SALLY_BUILD_TIME}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --prod=false --frozen-lockfile

COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/web/node_modules apps/web/node_modules

EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
