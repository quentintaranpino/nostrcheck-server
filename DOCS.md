# Documentation

## Admin

### resetpassword [POST]
This method generates a new password for a user. The request must include a valid pubkey and an Authorization header with a valid authkey. On success, it returns a message indicating that the new password was generated, along with an authkey.

Endpoint: https://nostrcheck.me/api/v2/admin/resetpassword

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `pubkey`: The public key of the user.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/resetpassword",
    "headers": {
        "Content-Type": "application/json",      
	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "pubkey": "user_public_key"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "New password generated for user_key",
    "authkey": "auth_key"
}
```

### stop [POST]
This method stops the server. The request must include a valid Authorization header with a valid authkey. On success, it returns a message indicating that the server is stopping, along with an authkey.

Endpoint: https://nostrcheck.me/api/v2/admin/stop

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/stop",
    "headers": {
        "Content-Type": "application/json",      
        "Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "Stopping server...",
    "authkey": "auth_key"
}
```

### status [GET]
This method returns the status of the server. It does not require any parameters or an Authorization header.

Endpoint: https://nostrcheck.me/api/v2/admin/status

**Example Request**

```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/admin/status",
    "headers": {
        "Content-Type": "application/json"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "Nostrcheck API server is running.",
    "version": "0.5.0.1470",
    "uptime": "01:45:04"
}
```

### updaterecord [POST]
This method updates a record in the database. The request must include a valid Authorization header with a valid authkey. The request body must include the table name, field name, new value, and the id of the record to be updated.

Endpoint: https://nostrcheck.me/api/v2/admin/updaterecord

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Body**

- `table`: The name of the table in the database.
- `field`: The name of the field to be updated.
- `value`: The new value for the field.
- `id`: The id of the record to be updated.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/updaterecord",
    "headers": {
        "Content-Type": "application/json",
   "Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "table": "registered",
        "field": "username",
        "value": "newUsername",
        "id": "123"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "newUsername",
    "authkey": "auth_key"
}
```

### deleterecord [POST]
This method deletes a record in the database. The request must include a valid Authorization header with a valid authkey. The request body must include the table name and the id of the record to be deleted.

Endpoint: https://nostrcheck.me/api/v2/admin/deleterecord

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Body**

- `table`: The name of the table in the database.
- `id`: The id of the record to be deleted.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/deleterecord",
    "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "table": "registered",
        "id": 123
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "Record deleted succesfully",
    "authkey": "auth_key"
}
```

### insertrecord [POST]
This method inserts a new record into a specified table in the database. The request must include a valid table name, a row object with field-value pairs, and an Authorization header with a valid authkey. On success, it returns a message indicating that the record was inserted, along with an authkey.

Endpoint: https://nostrcheck.me/api/v2/admin/insertrecord

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `table`: The name of the table where the record will be inserted.
- `row`: An object containing field-value pairs to be inserted as a new record.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/insertrecord",
    "headers": {
        "Content-Type": "application/json",      
	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "table": "table_name",
        "row": {
            "field1": "value1",
            "field2": "value2",
            ...
        }
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "Records inserted",
    "authkey": "auth_key"
}
```

### updatesettings [POST]
This method updates the settings of a specified module in the application. The request must include a valid module name, a setting name, a new value for the setting, and an Authorization header with a valid authkey. On success, it returns a message indicating that the settings were updated, along with an authkey.

Endpoint: https://nostrcheck.me/api/v2/admin/updatesettings

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `name`: The name of the setting to be updated.
- `value`: The new value for the setting.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/updatesettings",
    "headers": {
        "Content-Type": "application/json",      
	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "name": "setting_name",
        "value": "new_value"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "Succesfully updated settings.",
    "authkey": "auth_key"
}
```
### updatelogo [POST]
This method updates the logo of the application. The request must include a valid module name, an Authorization header with a valid authkey, and a file with the new logo. If no file is provided, the default logo is restored. The logo is resized and converted to webp format before being saved. On success, it returns a message indicating that the logo was updated, along with an authkey.

Endpoint: https://nostrcheck.me/api/v2/admin/updatelogo

**Headers**

- `Content-Type`: multipart/form-data
- `Authorization`: Bearer {authkey}

**Parameters**

- `file`: The new logo file.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/admin/updatelogo",
    "headers": {
        "Content-Type": "multipart/form-data",
	"Authorization "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "file": "logo_file"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "Logo updated",
    "authkey": "auth_key"
}
```
### Domains

### domains [GET]
This method retrieves a list of available domains in the application. The request must include a valid module name and an Authorization header with a valid authkey. On success, it returns a list of available domains and an authkey.

This endpoint also can use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the user's authkey. The NIP98's pubkey must have the "allowed" field with "1" on registered database.

Endpoint: https://nostrcheck.me/api/v2/domains

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Example Request**

With authkey
```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/domains/",
    "headers": {
        "Content-Type": "application/json",
	"Authorization "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    }
}
```

With NIP98
```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/domains/",
    "headers": {
        "Content-Type": "application/json",
	"Authorization "Nostr ewogICJpZCI6ICI5MzMxMDUyY2FlYzQzNTE4NDRlMzM4YTgyZDhmMGRhNzEzZmVkNDk1ODViN2ZjNTVkMDg5MWVlOWZiMDYyYTJjIiwKICAicHVia2V5IjogIjgyMDhmYWNkY2FiMjk4NzgyYzllM2I3YjllZmIyMmJjMjQ2ZDE1NzcwZTBiNGY5NmJiZTUxYzQwNjViODJhZjAiLAogICJjcmVhdGVkX2F0IjogMTcwOTExNDEwNywKICAia2luZCI6IDI3MjM1LAogICJ0YWdzIjogWwogICAgWwogICAgICAibWV0aG9kIiwKICAgICAgIkdFVCIKICAgIF0sCiAgICBbCiAgICAgICJ1IiwKICAgICAgImh0dHBzOi8vbm9zdHJjaGVjay5tZS9hcGkvdjIvZG9tYWlucyIKICAgIF0KICBdLAogICJjb250ZW50IjogIiIsCiAgInNpZyI6ICI3ZDYyMzk1OGZhMjY5ZTY2NzhlYmZlOGVhN2JlOTlhMzgxNDlhYTc2NTdmZjJlZTVlYmM0ODYyNWFlODY3M2Y4Yjk0ZDM2YWUxMTAyOGVhOWU0MzNjZWY3ZmZhNWEwZDcxYjIyYzI0OGMyNDA5M2NkNGFmMjBmYjVjM2Y5MGE0MiIKfQ"
    }
}
```

**Example Response**

```json
{
    "AvailableDomains": ["domain1.com", "domain2.com"],
    "authkey": "auth_key"
}
```

### users [GET]
This method retrieves a list of available users for a specific domain in the application. The request must include a valid module name, an Authorization header with a valid authkey, and a domain parameter in the URL. 

This endpoint also can use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the user's authkey. The NIP98's pubkey must have the "allowed" field with "1" on registered database.

Endpoint: https://nostrcheck.me/api/v2/domains/{domain}/users

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `domain`: The domain for which to retrieve the list of available users.

**Example Request**

With authkey
```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/domains/example.com/users",
    "headers": {
        "Content-Type": "/json",
        "Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    }
}
```

With NIP98
```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/domains/domain1.com/users",
    "headers": {
        "Content-Type": "application/json",
        "Authorization": "Nostr ewogICJpZCI6ICI5MzMxMDUyY2FlYzQzNTE4NDRlMzM4YTgyZDhmMGRhNzEzZmVkNDk1ODViN2ZjNTVkMDg5MWVlOWZiMDYyYTJjIiwKICAicHVia2V5IjogIjgyMDhmYWNkY2FiMjk4NzgyYzllM2I3YjllZmIyMmJjMjQ2ZDE1NzcwZTBiNGY5NmJiZTUxYzQwNjViODJhZjAiLAogICJjcmVhdGVkX2F0IjogMTcwOTExNDEwNywKICAia2luZCI6IDI3MjM1LAogICJ0YWdzIjogWwogICAgWwogICAgICAibWV0aG9kIiwKICAgICAgIkdFVCIKICAgIF0sCiAgICBbCiAgICAgICJ1IiwKICAgICAgImh0dHBzOi8vbm9zdHJjaGVjay5tZS9hcGkvdjIvZG9tYWlucyIKICAgIF0KICBdLAogICJjb250ZW50IjogIiIsCiAgInNpZyI6ICI3ZDYyMzk1OGZhMjY5ZTY2NzhlYmZlOGVhN2JlOTlhMzgxNDlhYTc2NTdmZjJlZTVlYmM0ODYyNWFlODY3M2Y4Yjk0ZDM2YWUxMTAyOGVhOWU0MzNjZWY3ZmZhNWEwZDcxYjIyYzI0OGMyNDA5M2NkNGFmMjBmYjVjM2Y5MGE0MiIKfQ"
    }
}
```

**Example Response**

```json
{
    "domain1.com": ["user1", "user2"],
    "authkey": "auth_key"
}
```

### domain [PUT]
This method updates the domain of a user in the application. The request must include a valid module name, an Authorization header with a valid authkey, and a domain parameter in the request URL. On success, it returns a success message.

This endpoint also can use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the user's authkey. The NIP98's pubkey must have the "allowed" field with "1" on registered database.

Endpoint: https://nostrcheck.me/api/v2/domains/{domain}

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `domain`: The domain to be updated for the user.

**Example Request**

With authkey
```json
{
    "method": "PUT",
    "url": "https://nostrcheck.me/api/v2/domains/example.com",
    "headers": {
        "Content-Type": "application/json",
	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    }
}
```

With NIP98
```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/domains/domain1.com",
    "headers": {
        "Content-Type": "application/json",
        "Authorization": "Nostr ewogICJpZCI6ICJlYjlkMWY2OWJhZDYwN2IyZDg5OTFhYjJmNTAxYzQwMGNkZTQ4MTk0YmZlMDg3NmI5ZWMzN2I4NjRlZDYwMmVmIiwKICAicHVia2V5IjogIjgyMDhmYWNkY2FiMjk4NzgyYzllM2I3YjllZmIyMmJjMjQ2ZDE1NzcwZTBiNGY5NmJiZTUxYzQwNjViODJhZjAiLAogICJjcmVhdGVkX2F0IjogMTcwOTExNDEwNywKICAia2luZCI6IDI3MjM1LAogICJ0YWdzIjogWwogICAgWwogICAgICAibWV0aG9kIiwKICAgICAgIlBVVCIKICAgIF0sCiAgICBbCiAgICAgICJ1IiwKICAgICAgImh0dHBzOi8vbm9zdHJjaGVjay5tZS9hcGkvdjIvZG9tYWlucyIKICAgIF0KICBdLAogICJjb250ZW50IjogIiIsCiAgInNpZyI6ICI5MjZlZGNhYThkNjllNTUyZTI4NDZlZWJlMjY3ZGMxMDQ3YWU3ZjJiMjc0NzU0ZjZlYWI4YWQwZTQxZDJmZGY1YzI2MDdmNTM3YmE3NTUxMmRkZWIzNWE2NWVlZDQxZjEzNDRiODE2YTlmMzgzZWUzYTJkZTljMTgzNWU3MjBjOCIKfQ=="
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "User domain for pubkey Auth37f3352fe10584d7396f010eb501482930dd712f updated"
}
```

TODO. REFACTOR BELOW

### nostaddress [GET]
Returns whether a user name is registered on the server.

https://nostrcheck.me/api/v2/nostraddress

**Example**

[https://nostrcheck.me/api/v2/nostraddress?name=quentin](https://nostrcheck.me/api/v1/nostraddress?name=quentin)

```
{
names: {
        quentin: "89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c"
       }
}
```

### lightning [GET]
Returns the lightning redirect from a registered nostr address.

https://nostrcheck.me/api/v2/lightningaddress

**Example**

[https://nostrcheck.me/api/v2/lightningaddress/quentin](https://nostrcheck.me/api/v1/lightningaddress/quentin)

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

https://nostrcheck.me/api/v2/lightningaddress/

**Example**

[https://nostrcheck.me/api/v2/lightningaddress/test@test.com]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.


Response from server:
```
{
	"status": "success",
	"message": "Lightning redirect for pubkey 89836015acd0c3e0227718fbe64b6251a8425cda33f27c3e4bbf794effbc7450 updated"
}
```

### lightning [DELETE]
Allows to **delete** a lightning address redirect for a pubkey

https://nostrcheck.me/api/v1/lightningaddress/

**Example**

[https://nostrcheck.me/api/v2/lightningaddress]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.

Response from server:
``` 
{
	"status": "success",
	"message": "Lightning deletion for id: 1 and pubkey 40ea82aa4a450ea86cbb185a81f810edf2ac9810262f8e5952521f95ddfd8d97 successful"
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
				"http://localhost:3000/media/375fdc8cb766664da915d638f46ca0399cd13cbd81a3f25eb37371d9dbe1bc81/61b08dd1809b459e16d917bfae87c7b11acf0f4f2061334a567b3976de73c388.webp"
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

https://nostrcheck.me/api/v2/media/[id]/tags

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

https://nostrcheck.me/api/v2/media/tags/[TAG]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

**Example**

http://localhost:3000/api/v2/media/tags/hodl

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

https://nostrcheck.me/api/v2/media/[id]/visibility/[visibility]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

Visibility options:

```
0 -> private
1 -> public
```

**Example**

http://localhost:3000/api/v2/media/7/visibility/1

```
{
    "status": "success",
    "message": "Media visibility has changed",
    "id": "60",
    "visibility": "1"
}

```

### Media [DELETE]
Allows to **delete** a mediafile from database and disk.

This endpoint delete all files with the same hash of selected file.

https://nostrcheck.me/api/v2/media/

**Example**

[https://nostrcheck.me/api/v2/media/61b08dd1809b459e16d917bfae87c7b11acf0f4f2061334a567b3976de73c388.webp"]

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.

This endpoint use the [NIP96](https://github.com/nostr-protocol/nips/blob/96.md) HTTP File Storage Integration standard.

Response from server:
```
{
	"status": "success",
	"message": "Mediafile deletion for id: 82 and pubkey 40ea82aa4a450ea86cbb185a81f810edf2ac9810262f8e5952521f95ddfd8d97 successful"
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

https://nostrcheck.me/api/v2/register

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

https://nostrcheck.me/api/v2/verify

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
# Edit config file
sudo nano config/local.json

# Set 'environment' to 'development'
"environment" : "development", 

# Set 'environment' to 'production'
"environment" : "production", 
 
```
