# Documentation

## Admin

The **Admin API** provides endpoints to manage server operations, database records, and configuration. All endpoints are mounted under `/api/v2/admin` and enforce CORS (configured origin), rate limiting, and HTTP authentication (Bearer authkey or NIP98 HTTP Auth or Blossom HTTP Auth (BUD01)). Include a valid `Authorization` header in every request, and use `application/json` or `multipart/form-data` as specified.

### Stop server [POST]

Stops the server process immediately.

- **Endpoint:** `POST /api/v2/admin/stop`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)

Response:

```json
{
  "status": "success",
  "message": "Stopping server..."
}
```

### Server status [GET]

Retrieves server health and usage metrics.

- **Endpoint:** `GET /api/v2/admin/status`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)

Response:

```json
{
  "status": "success",
  "message": "Nostrcheck-server is running.",
  "version": "0.7.0",
  "uptime": "01:23:45",
  "ramUsage": 123,            // in MB
  "cpuUsage": 0.15,           // fraction of CPU
  "moderationQueue": 5        // number of items pending moderation
}
```

### Reset user password [POST]

Generates a random new password for a user.

- **Endpoint:** `POST /api/v2/admin/resetpassword`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `pubkey` (string) – User's public key
  - `domain` (string) – Tenant domain

Response:

```json
{
  "status": "success",
  "message": "New password generated for {pubkey}"
}
```

### Update database record [POST]

Modifies a specific field of a database record.

- **Endpoint:** `POST /api/v2/admin/updaterecord`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `table` (alias) – Logical name defined in `moduleDataKeys`
  - `field` (string) – Field name to update
  - `value` (any) – New value
  - `id` (string|number) – Record identifier
  - `tenant` (optional,string) – Tenant for plugin records

Response:

```json
{ "status": "success", "message": "{value}" }
```

### Insert database record [POST]

Adds a new record to a specified table.

- **Endpoint:** `POST /api/v2/admin/insertrecord`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `table` (alias)
  - `row` (object) – Field‑value pairs (omit `id`)

Response:

```json
{ "status": "success", "message": "{newRecordId}" }
```

### Delete database record [POST]

Removes a record and any related artifacts (files, cache, pending deletes).

- **Endpoint:** `POST /api/v2/admin/deleterecord`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `table` (alias)
  - `id` (number)

Response:

```json
{ "status": "success", "message": "Record deleted succesfully" }
```

### Moderate file record [POST]

Enqueues an object for moderation review.

- **Endpoint:** `POST /api/v2/admin/moderaterecord`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `table` (alias)
  - `id` (string|number)

Response:

```json
{ "status": "success", "message": "Moderation request sent" }
```

### Ban entity [POST]

Bans a database entity by ID and reason.

- **Endpoint:** `POST /api/v2/admin/ban`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `table` (alias)
  - `id` (string|number)
  - `reason` (string)

Response:

```json
{ "status": "success", "message": "{reason}" }
```

### Update settings [POST]

Updates configuration keys dynamically.

- **Endpoint:** `POST /api/v2/admin/updatesettings`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Body** (JSON)
  - `name` (string) – Dot‑separated config path (e.g. `frontend.maxAge`)
  - `value` (any)
  - `domain` (optional,string) – Specific tenant.

Response:

```json
{ "status": "success", "message": "Field: {name} updated successfully" }
```

### Upload custom settings file [POST]

Uploads or restores files (logos, icons) per tenant (if applicable).

- **Endpoint:** `POST /api/v2/admin/updatesettingsfile`
- **Headers**
  - `Content-Type`: multipart/form-data
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Form Fields**
  - File inputs matching keys in `acceptedSettingsFiles`
  - `{key}.default` = "true" to restore default
  - `domain` (optional,string) – Specific tenant.

Response:

```json
{ "status": "success", "message": "Field: {key} updated successfully" }
```

### Module data [GET]

Fetches paginated rows for admin modules (logs, plugins, etc.).

- **Endpoint:** `GET /api/v2/admin/moduledata`
- **Headers**
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Query Parameters**
  - `module` (string, required)
  - `offset`, `limit` (numbers)
  - `order` (ASC|DESC), `sort` (field)
  - `search` (string), `filter` (JSON string)
  - `tenant` (string, optional)

Response:

```json
{ "total":0, "totalNotFiltered":0, "rows":[...] }
```

### Module count data [GET]

Retrieves metrics or counts for modules.

- **Endpoint:** `GET /api/v2/admin/modulecountdata`
- **Headers**
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)
- **Query Parameters**
  - `module` (string, required)
  - `action` (string, required)
  - `field` (string, optional)

Supported actions:

- `serverBalance`, `unpaidTransactions`, `countWarning`, `countSynced`, `monthCount`

Response examples:

```json
{ "total": 100, "field": 20 }
```

## Domains

The **Domains API** provides endpoints to list available domains, list users per domain, and update a user's domain. All endpoints are mounted under `/api/v2/domains` and enforce CORS (configured origin), rate limiting, and HTTP authentication (Bearer authkey or NIP98 HTTP Auth or Blossom HTTP Auth (BUD01)). Include a valid `Authorization` header in every request, and use `application/json` as specified.


### List available domains [GET]

Retrieves all domains currently available for registration, including their invite/payment requirements and maximum allowed satoshis.

- **Endpoint:** `GET /api/v2/domains`
- **Headers**
  - `Content-Type`: application/json

**Response:**

```json
{
    "availableDomains": {
        "nostrcheck.me": {
            "requireinvite": false,
            "requirepayment": true,
            "maxsatoshi": 10000,
            "minUsernameLength": 3,
            "maxUsernameLength": "10"
        },
        "nostr-check.me": {
            "requireinvite": true,
            "requirepayment": false,
            "maxSatoshi": 0,
            "minUsernameLength": 3,
            "maxUsernameLength": "10"
        }
    }
}
```

### List domain users [GET]

Returns a list of registered usernames for a specific domain.

- **Endpoint:** `GET /api/v2/domains/{domain}/users`
- **Headers**
  - `Content-Type`: application/json
  - `Authorization`: Bearer {authkey} or Nostr HTTP Auth (NIP98) or Blossom HTTP Auth (BUD01)

**Response:**

```json
{
    "localhost": [
        {
            "id": 1,
            "username": "quentin",
            "hex": "89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c"
        },
        {
            "id": 2,
            "username": "public",
            "hex": "7168fba7e5c29eaf2b6f9d3e7736443459f478e19e0613e411c99df8244ed2e3"
        }
    ]
}
```

## Frontend

The Frontend API provides routes for rendering the web interface. All endpoints are mounted under /api/v2 (commonly /api/v2/) and enforce module-enabled checks, IP-based bans, rate limiting, and session authentication where required. Public pages render templates directly; protected pages redirect to the login flow if the user is not authenticated.

### api/v2 [GET]

Loads the index page. 

### api/v2/login [GET]

Loads the login page. If the user is already logged in, it redirects to the current API version. If it's the first use, it sets the first use to true and redirects to the front page where an alert will be shown.

### api/v2/login [POST]

Handles the login request. The user can log in using either a public key or a username and password. If the user chooses to remember their login, the session cookie's max age is set to the value specified in the configuration.

**Parameters**

- `pubkey`: The user's public key (optional).
- `username`: The user's username (optional).
- `password`: The user's password (optional).
- `rememberMe`: Whether to remember the user's login (optional).
- `otc`: The one-time code for 2FA (optional).

**Example Request**

```json
{
    "username": "user123",
    "password": "password123",
    "rememberMe": "true",
}
```

**Example Response**

```json
{ "status": "success", "message": "Logged in successfully" }
```

**Possible Responses**

- `200`: Login successful.
- `400`: Invalid request. Missing required parameters or invalid data.
- `401`: No credentials were provided, or the provided credentials were invalid.
- `500`: Failed to generate an authkey for the user.

### Load markdown pages [GET]

Renders Terms of Service, Privacy, or Legal pages from markdown.

- **Endpoints:** `/api/v2/legal`, `/api/v2/privacy`, `/api/v2/tos`

### api/v2/documentation [GET]

Loads the documentation page.

### api/v2/gallery [GET]

Loads the gallery page. 

### api/v2/register [GET]

Loads the register page.

### api/v2/directory [GET]

Loads the directory page.

### api/v2/dashboard [GET]

Loads the dashboard page. If the user is not logged in or the public key is not valid, it redirects to the login page or the current API version respectively.

### api/v2/settings [GET]

Loads the settings page. If the user is not logged in or the public key is not valid, it redirects to the login page or the current API version respectively.

### api/v2/profile [GET]

Loads the profile page. If the user is not logged in or the public key is not valid, it redirects to the login page or the current API version respectively.

### Server static resources [GET]

Delivers multi-tenant assets (images, icons).

Endpoint: GET /static/resources/:filename

Headers: none

Response: Returns the requested file or a 404 error if not found.

### Serve dynamic theme CSS [GET]

Generates CSS variables for theming.

### api/v2/logout [GET]

Logs out the user and redirects to the login page. If there's an error during the session destruction, it redirects to the current API version.

Note: All routes are rate-limited for security reasons. The limit varies depending on the route.

# Lightning

### lightningaddress [GET]

This method redirects to a user's Lightning address in the application. The request must include a valid username in the query parameter or in the route parameters. On success, it returns the details of the user's Lightning address.

Endpoint: https://nostrcheck.me/api/v2/lightningaddress/{name}

**Parameters**

- `name`: The username for which the Lightning address is being sought.

**Example Request**

```json
{
    "method": "GET",
    "url": "https://nostrcheck.me/api/v2/lightningaddress/quentin"
}
```

**Example Response**

Returns the details of the user's Lightning address, for example:

```json
{
    "callback": "https://livingroomofsatoshi.com/api/v1/lnurl/payreq/01cbf321-ed95-4d31-a0d0-64365e6d8ced",
    "maxSendable": 100000000000,
    "minSendable": 1000,
    "metadata": "[[\"text/plain\",\"Pay to Wallet of Satoshi user: quentin\"],[\"text/identifier\",\"quentin@walletofsatoshi.com\"]]",
    "commentAllowed": 255,
    "tag": "payRequest",
    "allowsNostr": true,
    "nostrPubkey": "be1d89794bf92de5dd64c1e60f6a2c70c140abac9932418fee30c5c637fe9479"
}
```

### lightningaddress [PUT]

This method updates a user's Lightning address in the application. The request must include a valid `lightningaddress` in the route parameters and a valid authorization header. On success, it updates the user's Lightning address and returns a success message.

This endpoint also can use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the user's authkey. 

Endpoint: https://nostrcheck.me/api/v2/lightningaddress/{lightningaddress}

**Parameters**

- `lightningaddress`: The Lightning address that needs to be updated.

**Headers**

- `Content-Type`: Should be `application/json`.
- `Authorization`: A valid authorization header. This can be a bearer token (authkey) or a NIP98 token.

**Example Request with authkey**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/lightningaddress/username@example.com",
    "headers": {
        "Content-Type": "application/json",   
 	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    }
}
```

**Example Request with NIP98**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/lightningaddress/username@example.com",
    "headers": {
        "Content-Type": "application/json",
        "Authorization": "Nostr ewogICJpZCI6ICIyNzhmYmQ4ZjUyYTczNGIwMjFkNDlkN2MwMGFkMWIwM2Q3MjA2MmM2MTBmMDJhMmNiZDY4NTNkZGIwYTFmODlmIiwKICAicHVia2V5IjogImFjMjI4MThhYzQyMTBmOGY2NjZmZWI4NjJhYTE2MDZmOGJmN2Y5YzI1OTZlNTVkY2JjMjY1ZWI0NTRhY2FkYjAiLAogICJjcmVhdGVkX2F0IjogMTcwOTExNDEwNywKICAia2luZCI6IDI3MjM1LAogICJ0YWdzIjogWwogICAgWwogICAgICAibWV0aG9kIiwKICAgICAgIlBVVCIKICAgIF0sCiAgICBbCiAgICAgICJ1IiwKICAgICAgImh0dHBzOi8vbm9zdHJjaGVjay5tZS9hcGkvdjIvbGlnaHRuaW5nYWRkcmVzcyIKICAgIF0KICBdLAogICJjb250ZW50IjogIiIsCiAgInNpZyI6ICJkMDM5ZmFmMWExZTQyZjI4Y2EzMDQwNjIyZDg4ODg3NDk3NGUxMGRkZjAwZTAxNWIxNDM1ZGQ0NjVhZjA4OGQyYzJjYmRhYTNkYTYzOTk1ZDhjNWI5ZWMzM2Y0MWJhODMzM2I0OWVhYzI0YmUwZjFkMGIzMjA4MGQ5NjBiMTllYSIKfQ=="
    }
}
```

**Example Response**

On success, a message is returned indicating the Lightning address has been updated:

```json
{
    "status": "success",
    "message": "Lightning redirect for pubkey {pubkey} updated"
}
```

### lightningaddress [DELETE]

This method deletes a user's Lightning address in the application. The request must include a valid `lightningaddress` in the route parameters and a valid authorization header. On success, it deletes the user's Lightning address and returns a success message.

This endpoint also can use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the user's authkey. 

Endpoint: https://nostrcheck.me/api/v2/lightningaddress

**Parameters**

- `lightningaddress`: The Lightning address that needs to be deleted.

**Headers**

- `Content-Type`: Should be `application/json`.
- `Authorization`: A valid authorization header. This can be a bearer token (authkey) or a NIP98 token.

**Example Request with authkey**

```json
{
    "method": "DELETE",
    "url": "https://nostrcheck.me/api/v2/lightningaddress",
    "headers": {
        "Content-Type": "application/json",   
	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    }
}
```

**Example Request with NIP98**

```json
{
    "method": "DELETE",
    "url": "https://nostrcheck.me/api/v2/lightningaddress/01cbf321-ed95-4d31-a0d0-64365e68ced",
    "headers": {
        "Content-Type": "application/json",
        "Authorization": "Nostr ewogICJpZCI6ICIyNzhmYmQ4ZjUyYTczNGIwMjFkNDlkN2MwMGFkMWIwM2Q3MjA2MmM2MTBmMDJhMmNiZDY4NTNkZGIwYTFmODlmIiwKICAicHVia2V5IjogImFjMjI4MThhYzQyMTBmOGY2NjZmZWI4NjJhYTE2MDZmOGJmN2Y5YzI1OTZlNTVkY2JjMjY1ZWI0NTRhY2FkYjAiLAogICJjcmVhdGVkX2F0IjogMTcwOTExNDEwNywKICAia2luZCI6IDI3MjM1LAogICJ0YWdzIjogWwogICAgWwogICAgICAibWV0aG9kIiwKICAgICAgIkRFTEVURSIKICAgIF0sCiAgICBbCiAgICAgICJ1IiwKICAgICAgImh0dHBzOi8vbm9zdHJjaGVjay5tZS9hcGkvdjIvbGlnaHRuaW5nYWRkcmVzcyIKICAgIF0KICBdLAogICJjb250ZW50IjogIiIsCiAgInNpZyI"
	}
}
```
Example Response

On success, a message is returned indicating the Lightning address has been deleted:

```json
{
    "status": "success",
    "message": "Lightning redirect for pubkey {pubkey} deleted"
}
```

# Media

### media [POST]

This endpoint allows for file uploads. The request must include a valid module name and a valid Authorization header.

Endpoint: https://nostrcheck.me/api/v2/media

**Body Parameters**

- `uploadtype`: Optional. Can be one of the following: `media`, `avatar`, `banner`. If not specified, the server will interpret it as "media" (standard upload).
- `[attached file]`: The file to be uploaded.

This endpoint uses the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth and gets the `pubkey` field from the auth note. 

This endpoint uses the [NIP96](https://github.com/nostr-protocol/nips/blob/96.md) HTTP File Storage Integration standard. 

The upload will be saved in the user's gallery, whether registered or not.

**Example Request**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/media",
    "headers": {
        "Content-Type":"multipart/form-data",
        "Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "uploadtype": "media",
        "file": "[attached file]"
    }
}
```

**Example Request with NIP98**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/media",
    "headers": {
        "Content-Type": "multipart/form-data",
        "Authorization": "Nostr ewogICJpZCI6ICJmOTNkMzg4MGNhM2U1NjYyZWM5MjhhZGEzYjFiMmY3MjlhOGRlNjk1MjJlODJlODQ0YTE2MzE0MDM5YmVhNzI3IiwKICAicHVia2V5IjogIjVjNTM0MDI4Y2QzNWNkNzg4YTFiNWU4OGQ0M2MxZTQxMzYwNDk3ZDM4MWIwZTUyNzUyNjUwNDQyZjkyYjczYTAiLAogICJjcmVhdGVkX2F0IjogMTY4MjMyNzg1MiwKICAia2luZCI6IDI3MjM1LAogICJ0YWdzIjogWwogICAgWwogICAgICAidSIsCiAgICAgICJodHRwczovbm9zdHJjaGVjay5tZS9hcGkvdjIvbWVkaWEiCiAgICBdLAogICAgWwogICAgICAibWV0aG9kIiwKICAgICAgIlBPU1QiCiAgICBdCiAgXSwKICAiY29udGVudCI6ICIiLAogICJzaWciOiAiZTIwOTcxNjQ5MDEwMjE5ZjdhMDFkNTc1NDVmNTJlZTVjZjIzOTMzMWM3NTA2ZGI3ZjYxOTc5OTUzOTJjMjZiYzQ4ZjYzYzBlYzNmM2I1ZjRmNmI3NzFhZGEzYzAwOThkN2RjNDFjM2ViNjJlYzcxODVjNTRmMzlkODlmNTI1YjkiCn0"
    },
    "body": {
        "uploadtype": "media",
        "file": "[attached file]"
    }
}
```

**Example Response**

```json
{
    "status": "success",
    "message": "",
    "processing_url": "https://nostrcheck.me.com/api/v2/media/3225",
    "nip94_event": {
        "id": "",
        "pubkey": "62c76eb094369d938f5895442eef7f53ebbf019f69707d64e77d4d182b609309",
        "created_at": 1710328339,
        "kind": 1063,
        "tags": [
            [
                "url",
                "https://nostrcheck.me/media/62c76eb094369d938f5895442eef7f53ebbf019f69707d64e77d4d182b609309/c35277dbcedebb0e3b80361762c8baadb66dcdfb6396949e50630159a472c3b2.webp"
            ],
            [
                "m",
                "image/webp"
            ],
            [
                "x",
                ""
            ],
            [
                "ox",
                "c35277dbcedebb0e3b80361762c8baadb66dcdfb6396949e50630159a472c3b2"
            ],
            [
                "size",
                "31356"
            ],
            [
                "dim",
                "1280x960"
            ],
            [
                "magnet",
                ""
            ],
            [
                "i",
                ""
            ],
            [
                "blurhash",
                "UI5Gw}UcX8knqFU{kCoyW@axoeflajockAa#"
            ]
        ],
        "content": "",
        "sig": ""
    }
}
```



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

https://nostrcheck.me/api/v2/media/:pubkey/:filename

https://nostrcheck.me/api/v2/media/:filename

All endpoints can be called with or without the file extension. 

If a URL is published in a nostr note without using the identifier (:username or :pubkey), it can only be deleted if it is the last copy on the server. 


**Example**

https://nostrcheck.me/media/quentin/41acecf32679693f563ea4c829f30179d67b40b834d90136836103dca9dc3d84.webp

https://nostrcheck.me/media/quentin/41acecf32679693f563ea4c829f30179d67b40b834d90136836103dca9dc3d84

https://nostrcheck.me/media/89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c/41acecf32679693f563ea4c829f30179d67b40b834d90136836103dca9dc3d84.webp

https://nostrcheck.me/media/89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c/41acecf32679693f563ea4c829f30179d67b40b834d90136836103dca9dc3d84

https://nostrcheck.me/media/41acecf32679693f563ea4c829f30179d67b40b834d90136836103dca9dc3d84.webp

https://nostrcheck.me/media/41acecf32679693f563ea4c829f30179d67b40b834d90136836103dca9dc3d84


If the mediafile is not found the server return the image defined on config file field:


```
"notFoudFilePath" : "media/file-not-found.webp",
 
```

### media [GET] (Listing files)
Allows to list files linked to the authenticated users pubkey.

https://nostrcheck.me/api/v2/media?page=0&count=100

This endpoint uses the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth and gets the `pubkey` field from the auth note. 

This endpoint uses the [NIP96](https://github.com/nostr-protocol/nips/blob/96.md) HTTP File Storage Integration standard. 

**Example**

https://nostrcheck.me/api/v2/media?page=0&count=100


```
{
  "count": 1, // server page size, eg. max(1, min(server_max_page_size, arg_count))
  "total": 1, // total number of files
  "page": 0, // the current page number
  "files": [
    {
      "tags": [
        ["ox": "719171db19525d9d08dd69cb716a18158a249b7b3b3ec4bbdec5698dca104b7b"],
        ["x": "5d2899290e0e69bcd809949ee516a4a1597205390878f780c098707a7f18e3df"],
        ["size", "123456"],
        ["alt", "a meme that makes you laugh"],
        ["expiration",  "1715691139"],
        // ...other metadata
      ]
      "content": "haha funny meme", // caption
      "created_at": 1715691130 // upload timestmap
    },
    ...
  ]
}
```

#Query args

- `page` page number (`offset=page*count`)
- `count` number of items per page


### media [GET] (TAGS)
Allows to get the tags of a file.

https://nostrcheck.me/api/v2/media/[id]/tags

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the media status. The NIP98's pubkey must be the same as the one who uploaded the file. 

**Example**

http://localhost:3000/api/v2/media/7/tags

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

[https://nostrcheck.me/api/v2/nip96](https://nostrcheck.me/api/v2/nip96)

```
{
api_url: "https://nostrcheck.me/api/v2/media",
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

# nostraddress

### nostraddress [GET]
Returns whether a user name is registered on the server.

https://nostrcheck.me/api/v2/nostraddress

**Example**

[https://nostrcheck.me/api/v2/nostraddress?name=quentin](https://nostrcheck.me/api/v2/nostraddress?name=quentin)

```
{
names: {
        quentin: "89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c"
       }
}
```

# register

### register [POST]

Allows to register a new username to the database

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be compared with the pubkey on the body.

If NIP98 header is not provided, the registration must be activated via OTC code sent to the pubkey via DM. 

Each domain can have a different registration policy. If the domain needs an invitation code, the body `must` have the `inviteCode` field with the correct value.

https://nostrcheck.me/api/v2/register

Example of a register request;

```json
{
"pubkey": "89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c",
"username": "quentin",
"domain": "nostrcheck.me",
"password": "ilovenostr",
"inviteCode" : "super-invite-code"
}
```

The server returns:

```json
{
    "status": "success",
    "message": "User registered successfully, pending OTC verification",
    "otc": true // Must be 'true' If the authorization header is not provided or the authorization header is not valid or the authorization header pubkey is different from the pubkey in the body
}
```

Each domain can have a different registration policy. If the domain needs a payment, the server will return a payment request with the amount (in sats) to be paid.

```json
{
    "status": "success",
    "message": "User registered successfully, pending payment",
    "otc": true, // Must be 'true' If the authorization header is not provided or the authorization header is not valid or the authorization header pubkey is different from the pubkey in the body
    "payment_request": "lnbc7650n1pntpnr0pp5ugca56laan4vpn9kp5kwyl7ayu6p3drpffr6mdx0exsj2p83f2eqhp5w48l28v60yvythn6qvnpq0lez54422a042yaw4kq8arvd68a6n7qcqzzsxqyz5vqsp509hhfvyl0zuklxfkwqdzjykkqy39mwmae5r9ykkt0l543sw6yw6q9qxpqysgqwxupqgjf4hrzgwjp595a20jxxs3utmuqhfgu6ns3wd38yac8a68kw6s0jl6u4xhvrngsu7h3ztttp6tsutwfnrt6xt3zl70lgr77y7gq7hq3rx",
    "satoshi": 765
}
```

### register [POST]

Allows to validate a registration OTC code.

https://nostrcheck.me/api/v2/register/validate

Example of a register request;

```json
{
"otc":"754610",
"domain": "nostriches.club"
}
```

The server returns:

```json
{
    "status": "succes", // Can be "success" or "error"
    "message": "Valid OTC" 
}
```

# verify

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

# Payments 

### paytransaction [POST]
Pay a transaction using server's balance. It will debit the amount from the server's expenses account (5000) and credit the amount to the user's account.

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.

https://nostrcheck.me/api/v2/payments/paytransaction


**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `transactionid`: The transaction id to mark as paid. And make journal entries.
- `amount`: The amount to pay.

**Example**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/payments/paytransaction",
    "headers": {
        "Content-Type": "application/json",      
	"Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "transactionid": "transactionid",
        "amount": 1000
    }
}
```

### addbalance [POST]

Add balance to a user's account. It will debit the amount from the server's expenses account (5000) and credit the amount to the user's account.

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.

https://nostrcheck.me/api/v2/payments/addbalance

**Headers**

- `Content-Type`: application/json
- `Authorization`: Bearer {authkey}

**Parameters**

- `amount`: The amount to add to the user's account.
- `id`: The username id to add the balance.

**Example**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/payments/addbalance",
    "headers": {
        "Content-Type": "application/json",
    "Authorization": "Bearer Auth37f3352fe10584d7396f010eb501482930dd712f"
    },
    "body": {
        "amount": 1000,
        "id": "username"
    }
}
```

### getbalance [GET]

Get the balance of a user's account.

This endpoint use the [NIP98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP Auth for getting the pubkey. The NIP98's pubkey must be registered on the database.

https://nostrcheck.me/api/v2/payments/getbalance

**Headers**

- `Authorization`: Bearer {authkey}

**Example**

[https://nostrcheck.me/api/v2/payments/getbalance](https://nostrcheck.me/api/v2/payments/getbalance)

The server returns:

```json
{
    "status": "success",
    "message": 1000,
}
```


## invoices [GET]

Get a information about a invoice.

https://nostrcheck.me/api/v2/payments/invoices/:payment_request

**Example**

[https://nostrcheck.me/api/v2/payments/invoices/lnbc7060n1pntp5lupp5qcufgtefn02q785zh8cyxvz5psjamk7vhhenadjd6nl5r0pp99gshp5w48l28v60yvythn6qvnpq0lez54422a042yaw4kq8arvd68a6n7qcqzzsxqyz5vqsp5pu6ye36cfcwv0g5x662vkqanv3szfgsudclfnmny2dcsxcn9lpqq9qxpqysgqusycld8fwa2ygnpksfypvkdyhent5td940sy38z8gkf3rnuxtezr2lstyp59jzmjm6ut9xvn48lee2t3g70v5g5ehnm58gxph45ceysq6zn572](https://nostrcheck.me/api/v2/payments/invoices/lnbc7060n1pntp5lupp5qcufgtefn02q785zh8cyxvz5psjamk7vhhenadjd6nl5r0pp99gshp5w48l28v60yvythn6qvnpq0lez54422a042yaw4kq8arvd68a6n7qcqzzsxqyz5vqsp5pu6ye36cfcwv0g5x662vkqanv3szfgsudclfnmny2dcsxcn9lpqq9qxpqysgqusycld8fwa2ygnpksfypvkdyhent5td940sy38z8gkf3rnuxtezr2lstyp59jzmjm6ut9xvn48lee2t3g70v5g5ehnm58gxph45ceysq6zn572)

The server returns:

```json
{
    "status": "success",
    "message": "Invoice status",
    "invoice": {
        "paymentRequest": "lnbc7060n1pntp5lupp5qcufgtefn02q785zh8cyxvz5psjamk7vhhenadjd6nl5r0pp99gshp5w48l28v60yvythn6qvnpq0lez54422a042yaw4kq8arvd68a6n7qcqzzsxqyz5vqsp5pu6ye36cfcwv0g5x662vkqanv3szfgsudclfnmny2dcsxcn9lpqq9qxpqysgqusycld8fwa2ygnpksfypvkdyhent5td940sy38z8gkf3rnuxtezr2lstyp59jzmjm6ut9xvn48lee2t3g70v5g5ehnm58gxph45ceysq6zn572",
        "paymentHash": "0638942f299bd40f1e82b9f04330540c25dddbccbdf33eb64dd4ff41bc212951",
        "satoshi": 706,
        "isPaid": true,
        "createdDate": "2024-08-05T13:30:36.000Z",
        "expiryDate": "2024-08-06T13:30:36.000Z",
        "paidDate": "2024-08-06T06:24:05.000Z",
        "description": "Invoice for: registered:2633",
        "transactionid": 188,
        "accountid": 1100002633
    }
}
```

## calcualteamount [POST]

Calculate the amount in satoshi for an object. Can be used to calculate the amount for a media upload or a register username.

https://nostrcheck.me/api/v2/payments/calculateamount

**Headers**

- `Content-Type`: application/json

**Parameters**

- `size`: The size of the object in bytes or the number of characters.
- `domain`: If the object is a register username, the domain must be the target domain for the username. For media must be empty.

**Example**

```json
{
    "method": "POST",
    "url": "https://nostrcheck.me/api/v2/payments/calculateamount",
    "headers": {
        "Content-Type": "application/json"
    },
    "body": {
        "size": 12, // An username has 12 characters
        "domain": "nostrcheck.me"
    }
}
```

The server returns:

```json
{
    "status": "success",
    "message": "Calculated satoshi successfully",
    "amount": 2100
}
```

# Running, developing and building the app

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

You can define your preferred log level in the configuration file. Default loglevel is set to 5 (Error messages)

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
