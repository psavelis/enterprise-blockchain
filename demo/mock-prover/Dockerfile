# Mock Stone Prover for Demo
#
# A lightweight Node.js server that simulates the Stone STARK prover API.
# Returns realistic mock proofs for demo and testing purposes.
#
# For production, use the real Stone prover at: ../infra/docker/stone-prover/

FROM node:22-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S prover && \
    adduser -u 1001 -S prover -G prover

COPY --chown=prover:prover package.json server.js ./
RUN npm install --omit=dev && chown -R prover:prover /app

USER prover

EXPOSE 10000 9100

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost:10000/health || exit 1

CMD ["node", "server.js"]
