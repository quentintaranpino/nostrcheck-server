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

## Frontend

### api/v2 [GET]

Loads the index page. If it's the first use, it shows an alert on the frontend.

### api/v2/login [GET]

Loads the login page. If the user is already logged in, it redirects to the current API version. If it's the first use, it sets the first use to true and redirects to the front page where an alert will be shown.

### api/v2/login [POST]

Handles the login request. The user can log in using either a public key or a username and password. If the user chooses to remember their login, the session cookie's max age is set to the value specified in the configuration.

**Parameters**

- `pubkey`: The user's public key (optional).
- `username`: The user's username (optional).
- `password`: The user's password (optional).
- `rememberMe`: Whether to remember the user's login (optional).

**Example Request**

```json
{
    "username": "user123",
    "password": "password123",
    "rememberMe": "true"
}
```

**Example Response**

```json
true
```

This response indicates that the login was successful. If the login fails, the response will be `false`.

**Error Responses**

- `400`: The frontend module is not enabled, or an attempt was made to access a secure session over HTTP.
- `401`: No credentials were provided, or the provided credentials were invalid.
- `500`: Failed to generate an authkey for the user.

### api/v2/tos [GET]

Loads the Terms of Service page. If it's the first use, it shows an alert on the frontend.

### api/v2/documentation [GET]

Loads the documentation page. If it's the first use, it shows an alert on the frontend.

### api/v2/dashboard [GET]

Loads the dashboard page. If the user is not logged in or the public key is not valid, it redirects to the login page or the current API version respectively.

### api/v2/settings [GET]

Loads the settings page. If the user is not logged in or the public key is not valid, it redirects to the login page or the current API version respectively.

### api/v2/profile [GET]

Loads the profile page. If the user is not logged in or the public key is not valid, it redirects to the login page or the current API version respectively.

### api/v2/gallerydata [GET]

Loads the gallery data for the logged-in user. The page number can be specified as a query parameter. If no page number is specified, the first page is returned. Each page contains 18 media files.

**Parameters**

- `page`: The page number (optional).

**Example Response**

```json
{
    "username": "user123",
    "mediaFiles": [
        {
            "id": "file1",
            "url": "https://example.com/media/file1.jpg",
            "title": "File 1",
            "description": "This is file 1",
            "uploadDate": "2022-01-01T00:00:00Z"
        },
        {
            "id": "file2",
            "url": "https://example.com/media/file2.jpg",
            "title": "File 2",
            "description": "This is file 2",
            "uploadDate": "2022-01-02T00:00:00Z"
        },
        // ... more media files ...
    ]
}
```

This response includes the username and an array of media files. Each media file object includes the file ID, URL, title, description, and upload date.

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
