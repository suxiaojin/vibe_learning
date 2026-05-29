FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
EXPOSE 3000
CMD ["npm", "run", "start"]
