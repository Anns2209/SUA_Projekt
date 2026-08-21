# Majhna alpine osnovna slika
FROM node:20-alpine

WORKDIR /app

# Najprej samo package.json -> boljši Docker cache pri ponovnih gradnjah
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
