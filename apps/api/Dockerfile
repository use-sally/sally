FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
ARG SALLY_VERSION=0.0.0
ARG SALLY_GIT_SHA=
ARG SALLY_BUILD_TIME=
ENV SALLY_VERSION=${SALLY_VERSION}
ENV SALLY_GIT_SHA=${SALLY_GIT_SHA}
ENV SALLY_BUILD_TIME=${SALLY_BUILD_TIME}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/types packages/types

RUN pnpm --filter @sally/db prisma:generate && pnpm --filter api build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
ARG SALLY_VERSION=0.0.0
ARG SALLY_GIT_SHA=
ARG SALLY_BUILD_TIME=
ENV NODE_ENV=production
ENV SALLY_VERSION=${SALLY_VERSION}
ENV SALLY_GIT_SHA=${SALLY_GIT_SHA}
ENV SALLY_BUILD_TIME=${SALLY_BUILD_TIME}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --prod=false --frozen-lockfile

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/src/bootstrap.ts apps/api/src/bootstrap.ts
COPY --from=build /app/packages/db packages/db
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/packages/db/node_modules packages/db/node_modules

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
