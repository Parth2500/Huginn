FROM node:24-alpine AS development
WORKDIR /huginn/web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm at the version in the packageManager field of package.json.
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 4200

FROM development AS build
RUN pnpm run build

# Static files only; serve them from any web server or CDN behind the API's reverse proxy.
FROM nginx:alpine AS production
COPY --from=build /huginn/web/dist/huginn/browser /usr/share/nginx/html
EXPOSE 80
