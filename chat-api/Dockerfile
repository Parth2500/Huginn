# node version
FROM node:16 AS development

# working directory
WORKDIR /chat-demo/api/src/app

# copy package.json
COPY package*.json ./

# install dependencies
RUN npm i

# copy sources
COPY . .

# bulid
RUN npm run build

# expose port
EXPOSE 3000

####################
#### PRODUCTION ####
####################

# node version
FROM node:16 AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# working directory
WORKDIR /chat-demo/api/src/app

# copy package.json
COPY --from=development /chat-demo/api/src/app .

# expose port
EXPOSE 3000

# run
CMD [ "node", "dist/main" ]
