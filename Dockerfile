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
COPY ./config/default.json /usr/src/app/config/
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
