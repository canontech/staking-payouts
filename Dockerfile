FROM node:latest

COPY . /app
WORKDIR /app

RUN yarn install --production
RUN yarn link

RUN chmod +x /usr/local/bin/payouts

ENTRYPOINT ["/usr/local/bin/payouts"]
