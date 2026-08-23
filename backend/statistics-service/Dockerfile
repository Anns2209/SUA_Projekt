FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production && npm cache clean --force

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]