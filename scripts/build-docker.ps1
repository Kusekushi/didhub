# Build Docker image for the Rust server
docker build -f server-rs/Dockerfile.rust -t didhub/rust-app:latest .