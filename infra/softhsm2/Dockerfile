# SoftHSM2 Docker Image for PKCS#11 Testing
#
# Provides a software PKCS#11 implementation compatible with real HSM workflows.
# Use this for CI/CD testing of HSM-dependent code without real hardware.
#
# Build: docker build -t softhsm2 .
# Run:   docker run -d --name softhsm2 -v softhsm2-tokens:/var/lib/softhsm/tokens softhsm2

FROM debian:bookworm-slim

LABEL maintainer="Paulo Savelis"
LABEL description="SoftHSM2 for PKCS#11 integration testing"

# Install SoftHSM2 and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    softhsm2 \
    opensc \
    libengine-pkcs11-openssl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/softhsm/tokens \
    && chmod 755 /var/lib/softhsm/tokens

# Configure SoftHSM2
RUN echo "directories.tokendir = /var/lib/softhsm/tokens\n\
objectstore.backend = file\n\
log.level = INFO\n\
slots.removable = false" > /etc/softhsm/softhsm2.conf

# Initialize a default token
# SO PIN: 1234567890 (Security Officer)
# User PIN: 1234 (Crypto User)
RUN softhsm2-util --init-token --slot 0 --label "enterprise-blockchain" \
    --so-pin 1234567890 --pin 1234

# Volume for persistent token storage
VOLUME /var/lib/softhsm/tokens

# Default command: keep container running
CMD ["tail", "-f", "/dev/null"]
