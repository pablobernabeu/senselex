# SenseLex Atlas server image.
#
# Base image: node:24-alpine, pinned by digest
#   sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
#   (resolved from Docker Hub on 23 September 2026; the tag was last updated on
#   18 September 2026). Re-resolve and update the digest to take up security
#   fixes: docker buildx imagetools inspect node:24-alpine
# Purpose: run the Atlas web service and database. The validation analyses do not
#   run in this image; they need only Node (see validation/README.md).
# Build:   docker build -t senselex:0.2.0 .
# Run (one line):
#   docker run -p 8787:8787 -v senselex-data:/app/data -e SENSELEX_API_TOKENS=<comma-separated tokens> -e SENSELEX_CORS_ORIGINS=<allowed origins, optional> senselex:0.2.0
# Or:      docker compose up, which reads the same variables from a .env file
#          beside docker-compose.yml.
#
# A minimal, hardened image. There is nothing to install because the application
# has no third-party dependencies, so the build is just the runtime plus the
# source, run as an unprivileged user.

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

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
