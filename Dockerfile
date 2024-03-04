FROM node:20

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
RUN npm install
COPY ./src ./src
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
