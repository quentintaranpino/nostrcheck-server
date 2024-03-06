FROM node:20

# Install apt packages
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y ffmpeg nano && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
RUN npm install -g npm@latest
RUN npm install --include=optional sharp

COPY ./src ./src

# Config files
COPY ./config/default.json /usr/src/app/config/
RUN if [ ! -f /usr/src/app/config/local.json ]; then \
    echo "{ \
        \"database\": { \
            \"host\": \"mariadb\", \
            \"user\": \"nostrcheck\", \
            \"password\": \"nostrcheck\", \
            \"database\": \"nostrcheck\" \
        }, \
        \"redis\": { \
            \"host\": \"redis\", \
            \"port\": \"6379\", \
            \"user\": \"default\", \
            \"password\": \"\", \
            \"expireTime\": 300 \
        } \
    }" > /usr/src/app/config/local.json; \
fi
RUN npm run build

EXPOSE 3000

# Docker-compose-wait tool
ENV WAIT_VERSION 2.7.2
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/$WAIT_VERSION/wait /wait
RUN chmod +x /wait

CMD ["npm", "start"]
