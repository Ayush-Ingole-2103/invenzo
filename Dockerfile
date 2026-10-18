# ─── Stage 1: Build / install dependencies ───────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Copy only package files first for better layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Remove dev/local files that shouldn't be in the image
RUN rm -f .env debug_sales.js

# Create the persistent data directory (will be overridden by Fly volume mount)
RUN mkdir -p /data

# Expose port
EXPOSE 5000

# Environment
ENV NODE_ENV=production
ENV PORT=5000

# Start the server
CMD ["node", "server.js"]
