FROM node:current-alpine

RUN apk add --no-cache python3 make g++

COPY . /app
WORKDIR /app

RUN npm install -g corepack --force && corepack enable && yarn install
RUN yarn build

ENTRYPOINT ["node", "/app/build/index.js"]
