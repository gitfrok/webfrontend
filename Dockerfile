# syntax=docker/dockerfile:1
# T-0021 / ADR-0035: Astro SSR needs Node, but its final image still has no shell or package manager.
FROM docker.io/library/node:26.0.0-alpine3.22 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM docker.io/library/node:26.0.0-alpine3.22
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Node runs without BusyBox. Removing it also removes /bin/sh and apk: no interactive shell or
# package manager survives in the production SSR image (ADR-0035 decision 8).
RUN rm -f /bin/busybox /bin/sh /bin/ash /sbin/apk
USER node
EXPOSE 4321
# The base entrypoint is a shell script, intentionally removed with BusyBox above. Execute Node
# directly so the image keeps the no-shell runtime posture.
ENTRYPOINT []
CMD ["node", "./dist/server/entry.mjs"]
