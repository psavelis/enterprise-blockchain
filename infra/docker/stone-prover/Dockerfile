# Stone Prover Docker Image
#
# Builds the StarkWare Stone prover with Madara Prover RPC server for
# production-grade STARK proof generation. The image provides a gRPC
# interface for executing Cairo programs and generating STARK proofs.
#
# Architecture:
# - Stone prover (cpu_air_prover): Generates STARK proofs from Cairo execution traces
# - Stone verifier (cpu_air_verifier): Verifies STARK proofs
# - Madara Prover RPC: gRPC server exposing prover functionality
#
# Build stages:
# 1. Base: Install system dependencies and Rust toolchain
# 2. Stone: Build Stone prover from source using Bazel
# 3. Prover: Build Madara Prover RPC server
# 4. Runtime: Minimal image with prover binaries
#
# References:
# - https://github.com/starkware-libs/stone-prover
# - https://github.com/Moonsong-Labs/madara-prover-api
# - https://github.com/lambdaclass/cairo-vm

# ── Stage 1: Base with build dependencies ────────────────────────────────
FROM ubuntu:22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    cmake \
    curl \
    git \
    gnupg \
    libgmp-dev \
    libomp-dev \
    libssl-dev \
    pkg-config \
    python3 \
    python3-pip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Bazelisk (handles Bazel version management automatically)
RUN BAZELISK_VERSION=v1.19.0 \
    && curl -fsSL -o /usr/local/bin/bazel \
    "https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-amd64" \
    && chmod +x /usr/local/bin/bazel

# Install Rust for Madara Prover RPC
ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable \
    && rustup component add rustfmt clippy

# ── Stage 2: Build Stone prover ─────────────────────────────────────────
FROM base AS stone-builder

WORKDIR /build/stone

# Clone Stone prover repository (main branch)
RUN git clone --depth 1 https://github.com/starkware-libs/stone-prover.git .

# Build cpu_air_prover and cpu_air_verifier
RUN bazel build //... --jobs=4 \
    && cp bazel-bin/src/starkware/main/cpu/cpu_air_prover /usr/local/bin/ \
    && cp bazel-bin/src/starkware/main/cpu/cpu_air_verifier /usr/local/bin/

# ── Stage 3: Build Madara Prover RPC ────────────────────────────────────
FROM base AS prover-builder

WORKDIR /build/prover

# Clone Madara Prover API
RUN git clone --depth 1 https://github.com/Moonsong-Labs/madara-prover-api.git .

# Build the prover RPC server
RUN cargo build --release --package prover-rpc \
    && cp target/release/prover-rpc /usr/local/bin/

# ── Stage 4: Runtime image ──────────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgmp10 \
    libomp5 \
    libssl3 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install grpc_health_probe for container health checks
RUN GRPC_HEALTH_PROBE_VERSION=v0.4.19 \
    && wget -qO /usr/local/bin/grpc_health_probe \
    "https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64" \
    && chmod +x /usr/local/bin/grpc_health_probe

# Create non-root user for security
RUN groupadd --gid 1000 prover \
    && useradd --uid 1000 --gid prover --shell /bin/bash --create-home prover

# Copy binaries from build stages
COPY --from=stone-builder /usr/local/bin/cpu_air_prover /usr/local/bin/
COPY --from=stone-builder /usr/local/bin/cpu_air_verifier /usr/local/bin/
COPY --from=prover-builder /usr/local/bin/prover-rpc /usr/local/bin/

# Create directories for Cairo artifacts
RUN mkdir -p /app/cairo /app/proofs /app/config \
    && chown -R prover:prover /app

# Copy default configuration
COPY config/prover-config.json /app/config/

WORKDIR /app
USER prover

# Expose gRPC port
EXPOSE 10000

# Health check using grpc_health_probe
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD grpc_health_probe -addr=:10000

# Default command: start the prover RPC server
ENTRYPOINT ["/usr/local/bin/prover-rpc"]
CMD ["--port", "10000", "--config", "/app/config/prover-config.json"]
