# Nostrcheck-api-ts, backend server api for nostr.

This repository contains the public API to interact with nostr as a backend api server. Written in typescript.

## Available endpoints


### status [GET]
Returns the status of the server

http://nostrcheck.me/api/v1/status

**Example**

``` 
{
    "result": true,
    "description": "Nostrcheck API server is running.",
    "version": "0.3.3",
    "uptime": "20:03:34"
}
```
 
### domains [GET]
Return available domains on the server

http://nostrcheck.me/api/v1/domains

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the available domains. The NIP98's pubkey must have the "allowed" field with "1" on registered database.

**Example**
```
{
	"domains": [
		{
			"domain": "nostrcheck.me"
		},
		{
			"domain": "nostr-check.me"
		},
		{
			"domain": "nostriches.club"
		},
		{
			"domain": "plebchain.club"
		}
	]
}
```

### users [GET]
Return available users from a domain registerd on the server

http://nostrcheck.me/api/v1/domains/[domain]/users

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the available users. The NIP98's pubkey must have the "allowed" field with "1" on registered database.

**Example**

http://nostrcheck.me/api/v1/domains/nostrcheck.me/users

```
{
	"nostrcheck.me": [
		{
			"username": "public",
			"hex": "0a60549f014123c34157071943a7ddddf5663a92cf5040e15740305bf193b7a7"
		},
		{
			"username": "quentin",
			"hex": "2d02bb19d41d733ec94f6e81fe928c7c5dc3574d2f4e1ff1f24e1aa3eae69049"
		}
	]
}
```

### nostaddress [GET]
Returns whether a user name is registered on the server.

http://nostrcheck.me/api/v1/nostraddress

**Example**

[https://nostrcheck.me/api/v1/nostraddress?name=quentin](https://nostrcheck.me/api/v1/nostraddress?name=quentin)

```
{
names: {
        quentin: "89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c"
       }
}
```

### lightning [GET]
Returns the lightning redirect from a registered nostr address.

http://nostrcheck.me/api/v1/lightningaddress

**Example**

[https://nostrcheck.me/api/v1/lightningaddress?name=quentin](https://nostrcheck.me/api/v1/lightningaddress?name=quentin)

(Example response from walletofsatoshi server)

```
{
callback: "https://livingroomofsatoshi.com/api/v1/lnurl/payreq/000000000-0000-0000-0000-000000000000",
maxSendable: 100000000000,
minSendable: 1000,
metadata: "[["text/plain","Pay to Wallet of Satoshi user: perkynurse82"],["text/identifier","perkynurse82@walletofsatoshi.com"]]",
commentAllowed: 32,
tag: "payRequest",
allowsNostr: true,
nostrPubkey: "be1d89794bf92de5dd64c1e60f6a2c70c140abac9932418fee30c5c637fe9479"
}
```

### lightning [PUT]
Allows to update or create a lightning address redirect for a pubkey

http://nostrcheck.me/api/v1/lightningaddress/

**Example**

[https://nostrcheck.me/api/v1/lightningaddress/test@test.com]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.


Response from server:
```
{
	"result": true,
	"description": "Lightning redirect for pubkey 89836015acd0c3e0227718fbe64b6251a8425cda33f27c3e4bbf794effbc7450 updated"
}
```

### lightning [DELETE]
Allows to **delete** a mediafile from database and disk.

This endpoint delete all files with the same hash of selected file.

http://nostrcheck.me/api/v1/media/

**Example**

[https://nostrcheck.me/api/v1/media/1]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.


Response from server:
``` 
{
	"result": true,
	"description": "Mediafile deletion for id: 1 and pubkey 40ea82aa4a450ea86cbb185a81f810edf2ac9810262f8e5952521f95ddfd8d97 successful"
}
```



### media [POST]
Allows to upload files

http://nostrcheck.me/api/v1/media

This endpoint requires the following fields in the body:
```
uploadtype: [media, avatar, banner]
mediafile: [attached file]
```
if the uploadtype is not specified, the server will always interpret it as " media" (standard upload).

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth and get this fields from auth note:

```
pubkey
```
If the pubkey is registered, the upload will be saved in the user's gallery, otherwise the upload will be public (with the public parametrized pubkey), 


### media [GET] (ID)
Allows to get the status and information about a file

http://nostrcheck.me/api/v1/media

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

**Example**

http://localhost:3000/api/v1/media/7

```
{
    "result": true,
    "description": "The requested file was found",
    "url": "http://localhost:3000/media/public/localhost_f314d9dd69e4f2b7e409b7f46d277e3fd1cd9e53de36b4ad.webp",
    "status": "completed",
    "id": 7,
    "pubkey": "89836015acd0c3e0227718fbe64b6251a8425cda33f27c3e4bbf794effbc7450",
    "hash": "10fb7c4171ccc3ca60b5cdecb345fff396fcbdf350c01d89b4c370aa29aa1e8a",
    "magnet": "magnet:?xt=urn:btih:80d04f20cd03ad98ae654d2e23d8ae81bac059c6&dn=localhost_ffb...(example)",
    "tags": [
        "tag",
        "test",
        "best"
    ]
}
 
```


### media [GET] (URL)
Allows to download a file

http://nostrcheck.me/api/v1/media/:username/:filename


**Example**

https://nostrcheck.me/media/quentin/nostrcheck.me_02f004aa2b7d1d7e969f7a0523594bffba663e8aeb332ec0.webp

If the mediafile is not found the server return the image defined on config file field:


```
"notFoudFilePath" : "media/file-not-found.webp",
 
```

### media [GET] (TAGS)
Allows to get the tags of a file.

http://nostrcheck.me/api/v1/media/[id]/tags

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

**Example**

http://localhost:3000/api/v1/media/7/tags

```
[
    {
        "tag": "landscape"
    },
    {
        "tag": "meme"
    },
    {
        "tag": "bitcoin"
    }
]

```

### media [GET] (FILES BY TAG)
Allows to get the tags of a file.

http://nostrcheck.me/api/v1/media/tags/[TAG]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

**Example**

http://localhost:3000/api/v1/media/tags/hodl

```
{
    "result": true,
    "description": "Media files found",
    "mediafiles": [
        {
            "id": 11,
            "filename": "localhost_b4ad17d5c66f372977a7191115f049a470e441102ef0be0e.webp",
            "username": "public",
            "pubkey": "89836015acd0c3e0227718fbe64b6251a8425cda33f27c3e4bbf794effbc7450",
            "status": "completed"
        },
        {
            "id": 10,
            "filename": "localhost_f314d9dd69e4f2b7e409b7f46d277e3fd1cd9e53de36b4ad.webp",
            "username": "public",
            "pubkey": "89836015acd0c3e0227718fbe64b6251a8425cda33f27c3e4bbf794effbc7450",
            "status": "completed"
        }
    ]
}

```

### media [PUT] (Visibility)
Allows to change the visibility of a file. If the file is private it will not show on the gallery, but always will be accessible by the url.

http://nostrcheck.me/api/v1/media/[id]/visibility/[visibility]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

Visibility options:

```
0 -> private
1 -> public
```

**Example**

http://localhost:3000/api/v1/media/7/visibility/1

```
{
    "result": true,
    "description": "Media visibility has changed",
    "id": "60",
    "visibility": "1"
}

```

### Media [DELETE]
Allows to **delete** a lightning address redirect for a pubkey

http://nostrcheck.me/api/v1/lightningaddress/

**Example**

[https://nostrcheck.me/api/v1/lightningaddress]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.


Response from server:
```
{
	"result": true,
	"description": "Mediafile deletion for id: 82 and pubkey 40ea82aa4a450ea86cbb185a81f810edf2ac9810262f8e5952521f95ddfd8d97 successful"
}

```

### nip96 [GET]
Returns NIP96 server configuration

http://nostrcheck.me/api/v1/nip96

**Example**

[https://nostrcheck.me/api/v1/nip96](https://nostrcheck.me/api/v1/nip96)

```
{
api_url: "https://nostrcheck.me/api/v1/media",
download_url: "https://nostrcheck.me/media",
supported_nips: [
"NIP-94",
"NIP-98",
"NIP-96"
],
tos_url: "https://nostrcheck.me/register/tos.php",
content_types: [
"image/png",
"image/jpg",
"image/jpeg",
"image/gif",
"image/webp",
"video/mp4",
"video/quicktime",
"video/mpeg",
"video/webm",
"audio/mpeg",
"audio/mpg",
"audio/mpeg3",
"audio/mp3"
]
}
```

### register [POST]
Allows to register a new username to the database

http://nostrcheck.me/api/v1/register

Example of a register note for a new username
```
{
  "id": "2bb5408bf39277f6c9bbfa7a35c74169c9003a86a12b989947ddfe36cb19a0d7",
  "pubkey": "b6f1e9f6fe120a4aa29a89cbf198592df6f11a382bb28705e9b8e7458b926f48",
  "created_at": 1683729184,
  "kind": 30078,
  "tags": [
    [
      "username",
      "quentin"
    ],
    [
      "domain",
      "yourdomain"
    ]
  ],
  "content": "",
  "sig": "57b015348d2220f7cd5049fc86de50cf54b2a7f1de6c579912f549ad9abf9e36e47b629e0397edd1afa5ce7d402e282f380c9a68577bce337095326be19bb571"
}
```

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for register new user authorization. The NIP98's pubkey must have the "allowed" field with "1" on registered database.


### verify [POST]
Endpoint to verify a nostr note integrity and signature.

http://nostrcheck.me/api/v1/verify

**Example**

```
{
  "id": "3a3080d936db2d840ac09c251193f7a535e2474083785c7655503346998759b2",
  "pubkey": "b6f1e9f6fe120a4aa29a89cbf198592df6f11a382bb28705e9b8e7458b926f48",
  "created_at": 1683729184,
  "kind": 1,
  "tags": [],
  "content": "TEST",
  "sig": "6dac44ac1f4d85ac75961efb93bbaa1d334d0c683590aa53d823fbf3895261bccdd834306b3e3b8e7b5f38be2571158670694337d03787578d572558bab8749d"
}
```

The server returns:

```
{
	"pubkey": "0f1580f8dc1db5fbfa823cb4db1aa233f1b4ba253027b727ddb1918ebdea2ca9",
	"result": true,
	"description": "Valid Event"
}
```


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
#exit mariadb

sudo nano config/local.json
#edit config file with your data.

```

The server runs on:

http://localhost:3000/api/v1/

Several redirections via reverse proxy with a server such as apache or nginx must be performed. 

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

Example for nip96.json requests with nginx server:

```
#API redirect for nip96.json requests
location /.well-known/nip96.json {

    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:3000/api/v1/nip96;
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

#edit config file with your data.
sudo nano config/default.json

# run in dev mode
npm run dev

# generate production build
npm run build

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

The server don't verify NIP98 integrity and authorization when is running on development mode.

```
#edit config file
sudo nano config/default.json

#Set 'environment' to 'development'
"environment" : "development", 

#Set 'environment' to 'production'
"environment" : "production", 
 
```

## License

MIT
```


