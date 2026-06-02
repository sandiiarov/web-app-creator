FROM docker/sandbox-templates:shell

USER root

WORKDIR /opt/web-app-creator

COPY package.json ./package.json
RUN npm install -g n \
  && n 22.19.0 \
  && node --version \
  && npm --version
RUN npm install --omit=dev \
  && npm install -g \
    @types/react@19.2.15 \
    @types/react-dom@19.2.3 \
    @typescript/native-preview@7.0.0-dev.20260527.2 \
    oxlint@1.67.0 \
    oxfmt@0.52.0 \
    pnpm@11.1.3 \
    typescript@5.9.3 \
    vite@8.0.14

COPY config ./config
COPY extensions ./extensions
COPY runner ./runner

RUN mkdir -p /workspace \
  && chown agent:agent /workspace

USER agent
