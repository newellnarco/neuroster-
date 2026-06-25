# Neuroster — tiny static game server. No build, no dependencies.
FROM node:20-alpine

WORKDIR /app
COPY . .

# Host/port are configurable at runtime (LAN/WAN, specific IP if you want).
ENV HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080

# Basic container healthcheck hitting the /healthz endpoint.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server.js"]
