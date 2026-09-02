ARG III_VERSION=0.11.2

FROM node:22-slim AS agentmemory-build

ARG III_SDK_VERSION=0.11.2

WORKDIR /build/agentmemory
COPY package.json tsconfig.json tsdown.config.ts ./
COPY plugin ./plugin
COPY src ./src

RUN npm pkg set overrides.iii-sdk="${III_SDK_VERSION}" \
 && npm install --legacy-peer-deps --no-fund --no-audit \
 && npm run build \
 && npm pack --pack-destination /tmp \
 && mv /tmp/*.tgz /tmp/agentmemory.tgz

FROM iiidev/iii:${III_VERSION} AS iii-image

FROM node:22-slim

ARG III_VERSION=0.11.2
ARG III_SDK_VERSION=0.11.2

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=iii-image /app/iii /usr/local/bin/iii

# Install the checked-out fork so Railway runs the fixes in this repository
# instead of silently replacing them with the npm release.
WORKDIR /opt/agentmemory
COPY --from=agentmemory-build /tmp/agentmemory.tgz /tmp/agentmemory.tgz
RUN printf '{"name":"agentmemory-deploy","version":"1.0.0","private":true,"overrides":{"iii-sdk":"%s"}}\n' "${III_SDK_VERSION}" > package.json \
 && npm install /tmp/agentmemory.tgz --legacy-peer-deps --omit=optional --no-fund --no-audit \
 && rm /tmp/agentmemory.tgz \
 && ln -s /opt/agentmemory/node_modules/.bin/agentmemory /usr/local/bin/agentmemory

ENV AGENTMEMORY_III_VERSION=${III_VERSION} \
    TINI_SUBREAPER=1

COPY --chmod=0755 deploy/railway/entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

EXPOSE 3111

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
