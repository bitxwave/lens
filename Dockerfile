# syntax=docker/dockerfile:1.7

# ──── Stage 1: build frontend ────
# Pinned to BUILDPLATFORM: the SvelteKit output is static HTML/JS/CSS with
# no native code, so it is byte-identical whatever the target arch. Letting
# it follow TARGETPLATFORM would drag the whole Node toolchain through QEMU
# on the emulated arm/v7 build for an identical result.
FROM --platform=$BUILDPLATFORM node:20-alpine AS web-build
WORKDIR /web
RUN corepack enable
COPY web/pnpm-lock.yaml web/package.json ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# ──── Stage 2: build server ────
FROM rust:1.98-slim AS server-build
WORKDIR /server
# The official image installs a *versioned* toolchain (`1.98.0-<triple>`),
# never the `stable` alias. server/rust-toolchain.toml asks for
# `channel = "stable"`, which rustup treats as a different toolchain and
# downloads in full — even when it resolves to the very same rustc. That
# costs ~12 min natively and far more under QEMU on the arm/v7 leg, so
# name the bundled toolchain explicitly and skip the round trip. Keep this
# in step with the FROM tag above when bumping either.
ENV RUSTUP_TOOLCHAIN=1.98.0
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
# Cache deps layer
COPY server/Cargo.toml server/Cargo.lock ./
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs && echo '' > src/lib.rs && \
    cargo build --release --bin lens && \
    rm -rf src target/release/deps/lens* target/release/liblens* target/release/lens
# Real build
COPY server/ ./
ENV SQLX_OFFLINE=true
RUN cargo build --release --bin lens

# ──── Stage 3: runtime ────
FROM gcr.io/distroless/cc-debian12 AS runtime
COPY --from=server-build /server/target/release/lens /usr/local/bin/lens
COPY --from=web-build    /web/build                  /app/static
ENV PORT=8080 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static \
    RUST_LOG=info,sqlx=warn,tower_http=info \
    SECURE_COOKIES=false
VOLUME /app/data
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/lens"]
