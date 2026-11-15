# SenseLex Atlas server image.
#
# Base image: node:24-alpine, pinned by digest
#   sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
#   (pushed to Docker Hub on 11 November 2026 and resolved there on 14 November
#   2026). Dependabot proposes a new digest when Docker Hub publishes one
#   under this tag. To resolve the current digest by hand:
#   docker buildx imagetools inspect node:24-alpine
# Purpose: run the Atlas web service and database. The validation analyses do not
#   run in this image. They need only Node (see validation/README.md).
# Build:   docker build -t senselex:0.3.0 .
# Run (one line):
#   docker run -p 8787:8787 -v senselex-data:/app/data -e SENSELEX_API_TOKENS=<comma-separated tokens> -e SENSELEX_ADMIN_TOKENS=<comma-separated admin tokens, optional> -e SENSELEX_CORS_ORIGINS=<allowed origins, optional> senselex:0.3.0
# Or:      docker compose up, which reads the same variables from a .env file
#          beside docker-compose.yml.
# Without SENSELEX_ADMIN_TOKENS, any write token can change languages and
# concepts, and the server warns about it on start-up (see SECURITY.md).
#
# The application has no third-party dependencies, so the image holds only the
# Node runtime and the source, and it runs as an unprivileged user.

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

ENV NODE_ENV=production
WORKDIR /app

# Copy source. With no dependencies there is no install step.
COPY package.json ./
COPY bin ./bin
COPY src ./src

# Run as the non-root user that the base image provides, and give it a place to
# write the database.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8787
ENV SENSELEX_HOST=0.0.0.0
ENV SENSELEX_DATABASE_PATH=/app/data/senselex.db

# A simple liveness probe against the health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "bin/senselex.js", "serve"]
