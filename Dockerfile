FROM node:current-alpine

COPY . /app
WORKDIR /app

RUN yarn install
RUN yarn build

ENTRYPOINT ["node", "/app/build/index.js"]
