FROM rust:1.86-slim

SHELL ["bash", "-c"]

RUN apt-get update && apt-get install -y \
    curl \
    pkg-config \
    protobuf-compiler \
    clang \
    make \
    && rm -rf /var/lib/apt/lists/*

# Reduce parallel jobs to avoid I/O errors
ENV CARGO_BUILD_JOBS=2
ENV CARGO_NET_RETRY=10

RUN rustup target add wasm32-unknown-unknown
RUN cargo install --locked linera-service@0.15.5 linera-storage-service@0.15.5
RUN curl https://raw.githubusercontent.com/creationix/nvm/v0.40.3/install.sh | bash \
    && . ~/.nvm/nvm.sh \
    && nvm install lts/krypton \
    && npm install -g pnpm

WORKDIR /build

HEALTHCHECK CMD ["curl", "-s", "http://localhost:5173"]

ENTRYPOINT bash /build/run.bash
