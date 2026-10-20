FROM node:24-alpine AS development
WORKDIR /huginn/api
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /huginn/api
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=development /huginn/api/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
