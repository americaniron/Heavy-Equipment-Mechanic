# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy lockfile + package.json first so npm install layer caches
COPY package*.json ./

# Use `npm install` not `npm ci` — `npm ci` strict-fails on Node version skew
# between local lockfile generation and Cloud Build's Node 20 environment.
RUN npm install

COPY . .
RUN npm run build

# Runtime stage
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm install --omit=dev

# Build artifacts (server bundle + client static files)
COPY --from=builder /app/dist ./dist

# uploads/ is a runtime dir for multer file uploads. Created at startup
# inside the container (server/routes.ts mkdirs it on boot).

EXPOSE 8080
CMD ["node", "dist/index.cjs"]
