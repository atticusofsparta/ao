FROM node:18

WORKDIR /usr/app

COPY ./package.json .
COPY ./package-lock.json .
COPY ./src ./src

RUN npm install --omit=dev
RUN if ! -f wallet.json; then \
    npx -y @permaweb/wallet > wallet.json; \
    fi

ENV NODE_ENV=production

EXPOSE 3001

ENTRYPOINT ["npm"]

CMD ["run", "start"]
