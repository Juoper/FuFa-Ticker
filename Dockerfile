FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
# Generate Prisma Client
RUN npx prisma generate
# Build the application
RUN npm run build

FROM node:20-alpine
# Copy package files
COPY ./package.json package-lock.json /app/
# Copy production dependencies
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
# Copy built application
COPY --from=build-env /app/build /app/build
# Copy Prisma schema and generated client
COPY --from=build-env /app/prisma /app/prisma
COPY --from=build-env /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build-env /app/node_modules/@prisma /app/node_modules/@prisma
# Copy server file and app directory (needed for imports)
COPY --from=build-env /app/server.ts /app/server.ts
COPY --from=build-env /app/app /app/app
# Copy public directory for uploads
COPY --from=build-env /app/public /app/public

WORKDIR /app

# Create upload directories
RUN mkdir -p /app/public/uploads/memes

# Set default database URL if not provided
ENV DATABASE_URL="file:./prisma/dev.db"

# Expose port
EXPOSE 3000

# Run migrations and start the server
CMD sh -c "npx prisma migrate deploy --schema=/app/prisma/schema.prisma && npm run start"