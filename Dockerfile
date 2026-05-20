# syntax=docker/dockerfile:1.7

# ──── Stage 1: build frontend ────
FROM node:20-alpine AS web-build
WORKDIR /web
RUN corepack enable
COPY web/pnpm-lock.yaml web/package.json ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ──── Stage 2: build server ────
FROM rust:1.88-slim AS server-build
WORKDIR /server
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
# Cache deps layer
COPY server/Cargo.toml server/Cargo.lock ./
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs && echo '' > src/lib.rs && \
    cargo build --release --bin navsrv && \
    rm -rf src target/release/deps/navsrv* target/release/libnavsrv* target/release/navsrv
# Real build
COPY server/ ./
ENV SQLX_OFFLINE=true
RUN cargo build --release --bin navsrv

# ──── Stage 3: runtime ────
FROM gcr.io/distroless/cc-debian12 AS runtime
COPY --from=server-build /server/target/release/navsrv /usr/local/bin/navsrv
COPY --from=web-build    /web/build                   /app/static
ENV PORT=8080 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static \
    RUST_LOG=info,sqlx=warn,tower_http=info \
    SECURE_COOKIES=false
VOLUME /app/data
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/navsrv"]
