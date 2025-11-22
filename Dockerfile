FROM node:20-bookworm AS build
WORKDIR /app

# Install all dependencies (dev deps needed for TypeScript/Vite build)
COPY package.json package-lock.json ./
RUN npm ci

# Build server and client
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps for a smaller runtime image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000
CMD ["npm", "start"]
