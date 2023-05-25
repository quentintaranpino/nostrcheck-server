# Nostrcheck-api-ts, backend server api for nostr.

This repository contains the public API to interact with nostr as a backend api server. Written in typescript.

## Available endpoints

### domains [GET]
Return available domains on the server

http://localhost:3000/api/v1/domains

<!-- ### users [GET]
Return available users from a domain registerd on the server

http://localhost:3000/api/v1/users/[domain]/ -->

### nostaddress [GET]
Returns whether a user name is registered on the server.

http://localhost:3000/api/v1/nostraddress

### media [POST]
Allows to upload and delete files

http://localhost:3000/api/v1/media

### media [GET]
Allows to get the status of files

http://localhost:3000/api/v1/media

### register [POST]
Allows to register in the service

http://localhost:3000/api/v1/register

### verify [POST]
Endpoint to verify a nostr note integrity and signature.



http://localhost:3000/api/v1/verify

# Installing and running

```
sudo apt install git nodejs npm redis-server mariadb-server mariadb-client ffmpeg

git clone https://github.com/quentintaranpino/nostrcheck-api-ts.git

cd nostrcheck-api-ts

npm install

npm build

sudo mariadb

create database DATABASE_NAME;
grant all privileges on DATABASE_NAME.* TO 'USER_NAME'@'localhost' identified by 'PASSWORD';

flush privileges;

sudo nano dist/src/lib/database.js #(for npm run start)
sudo nano src/lib/database.ts #(for npm run dev)

#edit with your credentials and save.

```

The server runs on:

http://localhost:3000/api/v1/

A redirection via reverse proxy with a server such as apache or nginx must be performed. 

Example for nostr.json requests with nginx server:

```
#API redirect for nostr.json requests
location /.well-known/nostr.json {

proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header Host $host;
proxy_pass http://127.0.0.1:3000/api/v1/nostraddress;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
}

```

The server must have mariadb and redis for database and cache.

## Running, developing and building the app

```
# install dependencies
npm install

# run in dev mode on port 3000
npm run dev

# generate production build
npm run build

# edit dist/src/database.js with your mysql credentials and database name
nano dist/src/database.js

# run the server
npm run start
```

## Testing and linting

```
# run tests
npm run test

# run linter
npm run lint

# fix lint issues
npm run lint:fix
```
## Dev mode

The server don't verify NIP98 created_at integrity and payload when is running on development mode.

```
# Dev mode linux
export NODE_ENV=development

# Dev mode Windows (Powershell)
$env:NODE_ENV="development"

# Production mode linux
export NODE_ENV=production

# Production mode Windows (Powershell)
 $env:NODE_ENV="production"
 
```
