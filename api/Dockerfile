FROM node:24-alpine AS development
WORKDIR /huginn/api
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm at the version in the packageManager field of package.json.
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
EXPOSE 3000

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /huginn/api
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile --prod
COPY --from=development /huginn/api/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
