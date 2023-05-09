# Nostrcheck.me api server

This repository contains the public API to interact with nostrcheck.me services. Written in typescript.

## Available endpoints

### domains
Return available domains on the server

https://nostrcheck.me/api/v1/domains

### nostaddress 
Return if an username is registered in the server. 

https://nostrcheck.me/api/v1/nostraddress

<!-- ### media
Allows to upload, download and delete files

http://localhost:3000/api/v1/media -->

### register
Allows to register in the service

https://nostrcheck.me/api/v1/register

### verify
Allows to verify a nostr note

https://nostrcheck.me/api/v1/verify


### Installing and running

The server runs on:

http://localhost:3000/api/v1/

## Running the app

```
# install dependencies
npm install

# run in dev mode on port 3000
npm run dev

# generate production build
npm run build

Edit database.js with your mysql credentials.

# run generated content in dist folder on port 3000
npm run start
```

## Testing

```
npm run test
```

## Linting

```
# run linter
npm run lint

# fix lint issues
npm run lint:fix
```
