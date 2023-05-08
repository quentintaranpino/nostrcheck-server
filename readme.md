# Nostrcheck.me api server

This repository contains the public API to interact with nostrcheck.me services. Written in typescript.

## Endpoints

### nostaddress 
Return if an username is registered in the server. 

"http://localhost:3000/api/v1/nostraddress"

### media
Allows to upload, download and delete files

"http://localhost:3000/api/v1/media"

### register
Allows to register in the service

"http://localhost:3000/api/v1/register"


## Running the app

```
# install dependencies
npm install

# run in dev mode on port 3000
npm run dev

# generate production build
npm run build

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
