FROM node:latest

COPY . /app
WORKDIR /app

RUN yarn install --production
RUN yarn link

ENTRYPOINT ["/usr/local/bin/payouts"]