FROM node:20

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg sharp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
RUN npm install
RUN npm install --include=optional sharp
RUN npm install -g npm@latest
COPY ./src ./src

# Config files
COPY ./config/default.json /usr/src/app/config/
RUN echo "{ \
    \"database\": { \
        \"host\": \"127.0.0.1", \
        \"user\": \"nostrcheck, \
        \"password\": \"nostrcheck", \
        \"database\": \"nostrcheck" \
    } \
}" > /usr/src/app/config/local.json
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
