FROM node:20-alpine AS development-dependencies-env
WORKDIR /app
COPY package.json package-lock.json /app/
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . /app

FROM node:20-alpine AS production-dependencies-env
WORKDIR /app
COPY package.json package-lock.json /app/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

FROM node:20-alpine AS build-env
WORKDIR /app
# Copy package files and dependencies first
COPY package.json package-lock.json /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
# Copy prisma schema for client generation
COPY prisma /app/prisma
# Generate Prisma Client (do this before copying source code for better caching)
RUN npx prisma generate
# Now copy the rest of the source code
COPY . /app/
# Build the application
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY --from=build-env /app/package.json /app/package-lock.json ./
# Copy production dependencies
COPY --from=production-dependencies-env /app/node_modules ./node_modules
# Copy built application
COPY --from=build-env /app/build ./build
# Copy Prisma schema and generated client
COPY --from=build-env /app/prisma ./prisma
COPY --from=build-env /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build-env /app/node_modules/@prisma ./node_modules/@prisma
# Copy server file and app directory (needed for imports)
COPY --from=build-env /app/server.ts ./server.ts
COPY --from=build-env /app/app ./app
# Copy public directory for uploads
COPY --from=build-env /app/public ./public

# Create upload directories
RUN mkdir -p public/uploads/memes

# Set default database URL if not provided
ENV DATABASE_URL="file:./prisma/dev.db"

# Expose port
EXPOSE 3000
EXPOSE 5555

# Run migrations, seed, and start the server
CMD sh -c "npx prisma migrate deploy && npm run seed && (npx prisma studio --port 5555 --hostname 0.0.0.0 & npm run start)"