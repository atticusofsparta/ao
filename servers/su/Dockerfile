
# Stage 1: Build the static binary
FROM rust AS builder

# Set the working directory in the container
WORKDIR /usr/src/su

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the manifests
COPY Cargo.toml Cargo.lock ./

# This step is to cache your dependencies
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release

# Now copy the actual source code and build the application
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

# Stage 2: Create the final minimal image
FROM ubuntu:latest

# Copy the built binary from the previous stage
COPY --from=builder /usr/src/su/target/release/su /usr/local/bin/su

# Your additional configuration if needed...