FROM node:current-alpine

COPY . /app
WORKDIR /app

RUN yarn install --production

ENTRYPOINT ["node", "/app/build/index.js"]
