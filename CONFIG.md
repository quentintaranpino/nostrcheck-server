# Configuration

The server configuration is found in a JSON file located at config/local.json and contains several sections.

## Environment

```json
"environment" : "development"
```

This setting defines the environment in which the application is running. By default, it is set to "development". In this mode, the application does not perform NIP98 authentication checks, making it useful for testing purposes. However, **for security reasons, it is crucial to switch this setting to "production" before deploying a server to the public**. In "production" mode, the application will enforce NIP98 authentication checks as an additional security measure.


## Server

```json
"server": {
	"host": "localhost",
	"port": 3000,
	"pubkey": "",
	"secretKey": "",
	"tosFilePath" : "resources/tos.md"
}
```

The server configuration includes the host and port on which the server runs. It also includes the pubkey and secretKey for Nostr authentication, and tosFilePath is the path to the terms of service file.

If the pubkey and secretKey do not exist or do not match, the server will automatically generate a new pair of keys upon startup. This ensures that the server always has a valid pair of keys for Nostr authentication, even if the provided keys are missing or incorrect.

## Server Available Modules
This section of the configuration file specifies the modules that are available for use in the application. Each key-value pair within this object represents a module. The key is the name of the module, and the value is a boolean indicating whether the module is enabled (true) or disabled (false).

By enabling or disabling modules in this configuration, you can control which features are available in the application. This allows for a flexible setup where only the necessary modules are active, potentially improving performance and reducing resource usage.

```json
"availableModules": {
	"nostraddress" :{
		"name": "nostraddress",
		"enabled": true,
		"path": "/nostraddress",
		"methods": ["GET"],
		"description": "This module returns the pubkey for a nostraddress name for each domain."
	},
	"media":{
		"name": "media",
		"enabled": true,
		"path": "/media",
		"methods": ["GET","POST","PUT","DELETE"],
		"description": "This module handles media uploads, downloads, media tags, etc."
	},
	"lightning" :{
		"name": "lightning",
		"enabled": true,
		"path": "/lightningaddress",
		"methods": ["GET","PUT", "DELETE"],
		"description": "This module handles ightning redirections for a nostraddress."
	},
	"verify" :{
		"name": "verify",
		"enabled": true,
		"path": "/verify",
		"methods": ["POST"],
		"description": "This module can verify a nostr note integrity and timestamp."
	},
	"register" : {
		"name": "register",
		"enabled": true,
		"path": "/register",
		"methods": ["POST"],
		"description": "This module handles usernames creation from trusted pubkeys."
	},
	"domains" : {
		"name": "domains",
		"enabled": true,
		"path": "/domains",
		"methods": ["GET", "PUT"],
		"description": "This module handle lists of registered domains and usernames."
	},
	"admin" : {
		"name": "admin",
		"enabled": true,
		"path": "/admin",
		"methods": ["GET","POST"],
		"description": "Admin API, reboot, update remove and modify fields, server status, etc."
	},
	"frontend" : {
		"name": "frontend",
		"enabled": true,
		"path": "/",
		"methods": ["GET","POST"],
		"description": "This module handles the frontend, login page, register, dashboard, etc."
	}
}
```

## Database

```json
"database": {
	"host": "127.0.0.1",
	"user": "",
	"password": "",
	"database": "",
	"droptables": false
}
```

Database configuration, including the host, username, password, database name, and whether to drop existing tables. The database configuration can also be set through environment variables as shown in the snippet below:

```
DATABASE_HOST
DATABASE_USER
DATABASE_PASSWORD
DATABASE_DATABASE
```

## Redis

```json
"redis": {
	"host": "127.0.0.1",
	"port": "6379",
	"user": "default",
	"password": "",
	"expireTime": 300
}
```

Redis configuration, including the host, port, username, password, and key expiration time. The Redis configuration can also be set through environment variables as shown in the snippet below:

```
REDIS_HOST
REDIS_PORT
REDIS_USER
REDIS_PASSWORD
```

## Media

```json
"media" : {
	"maxMBfilesize": 100,
	"tempPath": "tmp/",
	"mediaPath": "media/",
	"notFoundFilePath" : "resources/file-not-found.webp",
	"allowPublicUploads" : true,
	"returnURL" : "",
	"transform" : {...}
}
```

The Media files configuration includes settings for maximum file size (in MB), a temporary path for media transformation, the path for media files, an image file path for when a file is not found, a setting for whether public uploads are allowed, a custom return URL, and settings for media file transformations.

If the returnURL is not defined in the configuration, the application will default to returning https://<servername>/media. Here, <servername> is the name of the server where the application is hosted. This default URL points to the location where the media files are stored on the server.

## Torrent

```json
"torrent": {
	"enableTorrentSeeding": false,
	"torrentPort": 6881,
	"dhtPort": 6882
}
```

Torrent configuration, including whether torrent seeding is enabled and the ports for Torrent and DHT.Disabled by default

## Logger

```json
"logger" :  {
	"minLevel": "5", 
	"filename": "nostrcheck-api",
	"size": "50M", 
	"interval": "60d",
	"compression": "gzip",
	"logPath": "logs/"
}
```

Logger configuration, including the minimum log level, log file name, maximum log file size, log rotation interval, compression type, and logs path.

## Session

```json
"session" : {
	"secret": "",
	"maxAge": 2592000000
}
```

The session configuration includes settings for the session secret and the maximum session age.

The secret is a key used to sign the session ID cookie. If it's not specified in the configuration, the application will automatically generate a session secret. This ensures that even if the secret is not explicitly set, the session ID cookie will still be signed, providing an additional layer of security.

The maxAge setting determines the maximum age (in milliseconds) of a session. After this period, the session will expire. 


# Default config 

If the configuration file does not exist, the application will automatically generate a new one with the following structure:

```json
{

	"environment" : "development",
	"server": {
		"host": "localhost",
		"port": 3000,
		"pubkey": "",
		"secretKey": "",
		"tosFilePath" : "resources/tos.md",
		"availableModules": {
		"nostraddress" :{
			"name": "nostraddress",
			"enabled": true,
			"path": "/nostraddress",
			"methods": ["GET"],
			"description": "This module returns the pubkey for a nostraddress name for each domain."
		},
		"media":{
			"name": "media",
			"enabled": true,
			"path": "/media",
			"methods": ["GET","POST","PUT","DELETE"],
			"description": "This module handles media uploads, downloads, media tags, etc."
		},
		"lightning" :{
			"name": "lightning",
			"enabled": true,
			"path": "/lightningaddress",
			"methods": ["GET","PUT", "DELETE"],
			"description": "This module handles ightning redirections for a nostraddress."
		},
		"verify" :{
			"name": "verify",
			"enabled": true,
			"path": "/verify",
			"methods": ["POST"],
			"description": "This module can verify a nostr note integrity and timestamp."
		},
		"register" : {
			"name": "register",
			"enabled": true,
			"path": "/register",
			"methods": ["POST"],
			"description": "This module handles usernames creation from trusted pubkeys."
		},
		"domains" : {
			"name": "domains",
			"enabled": true,
			"path": "/domains",
			"methods": ["GET", "PUT"],
			"description": "This module handle lists of registered domains and usernames."
		},
		"admin" : {
			"name": "admin",
			"enabled": true,
			"path": "/admin",
			"methods": ["GET","POST"],
			"description": "Admin API, reboot, update remove and modify fields, server status, etc."
		},
		"frontend" : {
			"name": "frontend",
			"enabled": true,
			"path": "/",
			"methods": ["GET","POST"],
			"description": "This module handles the frontend, login page, register, dashboard, etc."
		}
		}
	},
	"database": {
		"host": "127.0.0.1",
		"user": "",
		"password": "",
		"database": "",
		"droptables": false
	},
	"redis": {
		"host": "127.0.0.1",
		"port": "6379",
		"user": "default",
		"password": "",
		"expireTime": 300
	},
	"media" : {
		"maxMBfilesize": 100,
		"tempPath": "tmp/",
		"mediaPath": "media/",
		"notFoundFilePath" : "resources/file-not-found.webp",
		"allowPublicUploads" : true,
		"returnURL" : "",
		"transform" : {
		"media":{
			"undefined" : {
				"width" : "640",
				"height" : "480"
			},
			"image" : {
				"width" : "1280",
				"height" : "960"
			},
			"video" : {
				"width" : "720",
				"height" : "480"
			}
		},
		"avatar" : {
			"width" : "400",
			"height" : "400"
		},
		"banner" : {
			"width" : "900",
			"height" : "300"
		}
		}
	},
	"torrent": {
		"enableTorrentSeeding": false,
		"torrentPort": 6881,
		"dhtPort": 6882
	},
	"logger" :  {
		"minLevel": "5", 
		"filename": "nostrcheck-api",
		"size": "50M", 
		"interval": "60d",
		"compression": "gzip",
		"logPath": "logs/"
	},
	"session" : {
		"secret": "",
		"maxAge": 2592000000
	}
}
```
This automatic generation of a configuration file ensures that the application can run with default settings even if a configuration file is not provided.
