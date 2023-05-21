# Nostrcheck.me api server

This repository contains the public API to interact with nostrcheck.me services. Written in typescript.

## Available endpoints

### domains [GET]
Return available domains on the server

https://nostrcheck.me/api/v1/domains

### nostaddress [GET]
Returns whether a user name is registered on the server.

https://nostrcheck.me/api/v1/nostraddress

<!-- ## media
Allows to upload, download, share and delete files

http://localhost:3000/api/v1/media -->

### register [POST]
Allows to register in the service

https://nostrcheck.me/api/v1/register

### verify [POST]
Endpoint to verify a nostr note integrity and signature.

https://nostrcheck.me/api/v1/verify


# Installing and running

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

The server don't verify NIP98 created_at integrity when is running on development mode.

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
