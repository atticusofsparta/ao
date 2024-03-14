FROM node:18

# Set working directory
WORKDIR /usr/app

# Copy necessary files
COPY ./wallet.json .
COPY ./package.json .
COPY ./package-lock.json .
COPY ./src ./src

# Install dependencies
RUN npm install --omit=dev

# Define build-time environment variables
ARG NODE_ENV_CONFIG
ARG WALLET 
ARG WALLET_FILE 
ARG DEBUG 
ARG NODE_HEAPDUMP_OPTIONS

# ENV NODE_ENV_CONFIG=${NODE_ENV_CONFIG}
# ENV WALLET=${WALLET}
# ENV WALLET_FILE=${WALLET_FILE}
# ENV DEBUG=${DEBUG}
# ENV NODE_HEAPDUMP_OPTIONS=${NODE_HEAPDUMP_OPTIONS}

# Create .env file
# RUN echo "NODE_ENV_CONFIG=${NODE_ENV_CONFIG}" > ./.env \
#     && echo "WALLET=${WALLET}" >> ./.env \
#     && echo "WALLET_FILE=${WALLET_FILE}" >> ./.env \
#     && echo "DEBUG=${DEBUG}" >> ./.env

# Expose the application's port
EXPOSE 3001

ENTRYPOINT [ "npm" ]
# Set the command to run your application
CMD ["run", "start"]
