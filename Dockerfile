# A minimal, hardened image. There is nothing to install because the application
# has no third-party dependencies, so the build is just the runtime plus the
# source, run as an unprivileged user.

FROM node:24-alpine

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
