# ---------- Stopnja 1: namestitev odvisnosti ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# ---------- Stopnja 2: build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# URL-ji storitev, ki jih brskalnik uporabnika kliče preko gostiteljskih (host) portov
ARG NEXT_PUBLIC_LOGIN_SERVICE_URL=http://localhost:5001
ARG NEXT_PUBLIC_MENU_SERVICE_URL=http://localhost:5002
ARG NEXT_PUBLIC_ORDER_SERVICE_URL=http://localhost:5003
ARG NEXT_PUBLIC_SHIPPING_SERVICE_URL=http://localhost:5004
ENV NEXT_PUBLIC_LOGIN_SERVICE_URL=$NEXT_PUBLIC_LOGIN_SERVICE_URL
ENV NEXT_PUBLIC_MENU_SERVICE_URL=$NEXT_PUBLIC_MENU_SERVICE_URL
ENV NEXT_PUBLIC_ORDER_SERVICE_URL=$NEXT_PUBLIC_ORDER_SERVICE_URL
ENV NEXT_PUBLIC_SHIPPING_SERVICE_URL=$NEXT_PUBLIC_SHIPPING_SERVICE_URL

RUN npm run build

# ---------- Stopnja 3: produkcijski zagon (minimalna slika) ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js "standalone" izhod vsebuje samo tisto, kar je nujno za zagon
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
