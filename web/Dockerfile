FROM node:24-alpine AS development
WORKDIR /huginn/web
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4200

FROM development AS build
RUN npm run build

# Static files only; serve them from any web server or CDN behind the API's reverse proxy.
FROM nginx:alpine AS production
COPY --from=build /huginn/web/dist/huginn/browser /usr/share/nginx/html
EXPOSE 80
