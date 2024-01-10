# Nostrcheck server, backend server for nostr.

![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/53b67caf-ec98-4ac7-9829-742748a50fa6)

Nostrcheck server is a set of tools to interact with nostr and be sovereign of your data. 

It allows to validate nostr address (NIP05), multimedia uploads (NIP94, NIP96), nostr notes integrity check and lightning redirects. All under NIP98 authentication 100% nostr compatible.

The server can be installed anywhere and allows anyone to become a nostr service provider. 


BETA: New install script, you can [see it here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/scripts/install.sh)

```
wget https://raw.githubusercontent.com/quentintaranpino/nostrcheck-api-ts/main/scripts/install.sh && chmod +x install.sh && sudo ./install.sh
```

## Available endpoints


### status [GET]
Returns the status of the server

https://nostrcheck.me/api/v2/status

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

https://nostrcheck.me/api/v1/domains

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

https://nostrcheck.me/api/v1/domains/[domain]/users

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the available users. The NIP98's pubkey must have the "allowed" field with "1" on registered database.

**Example**

https://nostrcheck.me/api/v1/domains/nostrcheck.me/users

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

https://nostrcheck.me/api/v1/nostraddress

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

https://nostrcheck.me/api/v1/lightningaddress

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

https://nostrcheck.me/api/v1/lightningaddress/

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
Allows to **delete** a lightning address redirect for a pubkey

https://nostrcheck.me/api/v1/lightningaddress/

**Example**

[https://nostrcheck.me/api/v1/lightningaddress]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.

Response from server:
``` 
{
	"result": true,
	"description": "Lightning deletion for id: 1 and pubkey 40ea82aa4a450ea86cbb185a81f810edf2ac9810262f8e5952521f95ddfd8d97 successful"
}
```




### media [POST]
Allows to upload files

https://nostrcheck.me/api/v2/media

This endpoint requires the following fields in the body:

```
uploadtype: [media, avatar, banner] (Optional)
[attached file] 
```
if the uploadtype is not specified, the server will always interpret it as " media" (standard upload).

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth and get this fields from auth note.
This endpoint use the [NIP96](https://github.com/nostr-protocol/nips/blob/96.md) HTTP File Storage Integration standard.

```
pubkey
```
If the pubkey is registered, the upload will be saved in the user's gallery, otherwise the upload will be public (with the public parametrized pubkey), 


### media [GET] (ID) 
Allows to get the status and information about a file

https://nostrcheck.me/api/v2/media

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 
This endpoint use the [NIP96](https://github.com/nostr-protocol/nips/blob/96.md) HTTP File Storage Integration standard.

**Example**

http://localhost:3000/api/v2/media/7

```
{
	"status": "success",
	"message": "The requested file was found",
	"processing_url": "",
	"nip94_event": {
		"id": "",
		"pubkey": "134743ca8ad0203b3657c20a6869e64f160ce48ae6388dc1f5ca67f346019ee7",
		"created_at": "1702229660",
		"kind": 1063,
		"tags": [
			[
				"url",
				"http://localhost:3000/media/public/61b08dd1809b459e16d917bfae87c7b11acf0f4f2061334a567b3976de73c388.webp"
			],
			[
				"m",
				"image/webp"
			],
			[
				"x",
				"fdb457b9ff0243aebbd3b83a2136768e8392ce1e748feb640de7217edec0ea8f"
			],
			[
				"ox",
				"61b08dd1809b459e16d917bfae87c7b11acf0f4f2061334a567b3976de73c388"
			],
			[
				"size",
				"61282"
			],
			[
				"dim",
				"1096x620"
			],
			[
				"magnet",
				"magnet:?xt=urn:btih:721e3cb561a006228cc6a4b7f8d8a48e1c81bdab&dn=61b08dd1809b459e16d917bfae87c7b11acf0f4f2061334a567b3976de73c388.webp&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.dev"
			],
			[
				"i",
				""
			],
			[
				"blurhash",
				""
			]
		],
		"content": "",
		"sig": ""
	}
}
 
```


### media [GET] (URL)
Allows to download a file

https://nostrcheck.me/api/v2/media/:username/:filename


**Example**

https://nostrcheck.me/api/v2/media/quentin/nostrcheck.me_02f004aa2b7d1d7e969f7a0523594bffba663e8aeb332ec0.webp

If the mediafile is not found the server return the image defined on config file field:


```
"notFoudFilePath" : "media/file-not-found.webp",
 
```

### media [GET] (TAGS)
Allows to get the tags of a file.

https://nostrcheck.me/api/v1/media/[id]/tags

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

https://nostrcheck.me/api/v1/media/tags/[TAG]

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

https://nostrcheck.me/api/v1/media/[id]/visibility/[visibility]

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
Allows to **delete** a mediafile from database and disk.

This endpoint delete all files with the same hash of selected file.

https://nostrcheck.me/api/v2/media/

**Example**

[https://nostrcheck.me/api/v2media/61b08dd1809b459e16d917bfae87c7b11acf0f4f2061334a567b3976de73c388.webp"]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.
This endpoint use the [NIP96](https://github.com/nostr-protocol/nips/blob/96.md) HTTP File Storage Integration standard.

Response from server:
```
{
	"result": true,
	"description": "Mediafile deletion for id: 82 and pubkey 40ea82aa4a450ea86cbb185a81f810edf2ac9810262f8e5952521f95ddfd8d97 successful"
}

```

### nip96 [GET]
Returns NIP96 server configuration

https://nostrcheck.me/api/v2/nip96

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

https://nostrcheck.me/api/v1/register

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

https://nostrcheck.me/api/v1/verify

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

### stop [POST]
Endpoint to stop the server remotely. This endpoint use the an Authorization api token.

Type: Api key

KEY: authorization

VALUE: database password. (You can found it at local.json file)

https://nostrcheck.me/api/v2/admin/stop

**Example**
Whithout authorization key:
```
{
	"message": "Unauthorized"
}
```
Whit authorization key:
```
{
	"message": "Stopping server..."
}
```

## Running, developing and building the app

```
# install dependencies
npm install

#edit config file with your data.
sudo nano config/local.json

# run in dev mode
npm run dev

# generate production build
npm run build

# run the server
npm run start

```

## Loglevel

You can define your preferred log level in the configuration file. Default loglevel is set to 4 (Warning messages)

```

#edit config file with your data.
sudo nano config/local.json

#set "minLevel" to your preferred level:
#0: silly
#1: trace
#2: debug
#3: info
#4: warn
#5: error
#6: fatal

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

MIT License (MIT)

```
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

```


