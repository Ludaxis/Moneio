FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db ./packages/db
COPY apps/mcp-server ./apps/mcp-server

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @moneio/db db:generate

# Build MCP server
RUN pnpm --filter @moneio/mcp-server build

EXPOSE 3001

CMD ["node", "apps/mcp-server/dist/http-server.js"]
