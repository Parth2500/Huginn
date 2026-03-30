# node version
FROM node:16 AS development

# working directory
WORKDIR /chat-demo/app/src/app

# copy package.json
COPY package*.json ./

# install dependencies
RUN npm i
RUN npm i -g @angular/cli@latest

# copy sources
COPY . .

# bulid
RUN npm run build

# expose port
EXPOSE 4200
