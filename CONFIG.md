# Configuration

The server configuration is located in a JSON file at config/local.json and is divided into several sections.

Many of these parameters can be managed directly from the settings screen in the administration panel. This provides a user-friendly interface for adjusting the server configuration without having to manually edit the JSON file.

![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/913e05f8-dfdf-4f73-ab75-f842776ef620)


## Environment

```json
"environment" : "development"
```

This setting defines the environment in which the application is running. By default, it is set to "development". In this mode, the application does not perform NIP98 authentication checks, making it useful for testing purposes. However, **for security reasons, it is crucial to switch this setting to "production" before deploying a server to the public**. In "production" mode, the application will enforce NIP98 authentication checks as an additional security measure.

## Multi Tenancy

```json
"multiTenancy" : false,
```

This setting determines whether the application supports multi-tenancy. If set to true, the application can handle multiple tenants, each with its own isolated environment and config.

If set to false, the application operates in a single-tenant mode, meaning that all domains share the same environment and configuration.

See the [Multi Tenancy](https://github.com/quentintaranpino/nostrcheck-server/wiki/Multi-Tenancy) section for more information on how to set up and manage multi-tenancy.

## Auto login

```json
"autoLogin" : true,
```

This setting determines whether the application automatically logs in as the default admin user (public). If set to true, the application will log in as the default admin user without requiring any credentials. This is useful for testing and development purposes, but **it should be set to false in production environments**.

## Server

```json
"server": {
	"host": "localhost",
	"port": 3000,
	"pubkey": "",
	"secretKey": "",
	"tosFilePath" : "resources/tos.md",
	"privacyFilePath" : "resources/privacy.md",
	"legalFilePath" : "resources/legal.md",
	"legal" : {
		"entityType": "individual",
		"email": "",
		"country": "",
		"jurisdiction": "",
		"company": "",
		"address": "",
		"vat": "",
		"phone": ""
	}
},
```

The server configuration includes the host and port on which the server runs. It also includes the pubkey and secretKey for Nostr authentication, which are essential for the server's operation. The pubkey is the public key used to identify the server, while the secretKey is the private key used for signing messages.

If the pubkey and secretKey do not exist or do not match, the server will automatically generate a new pair of keys upon startup. This ensures that the server always has a valid pair of keys for Nostr authentication, even if the provided keys are missing or incorrect.

### Terms of Service (ToS) and Privacy Policy
The server configuration also includes file paths for the Terms of Service (ToS), Privacy Policy, and Legal documents. These documents are important for informing users about the server's policies and practices regarding data handling and user rights.
The ToS and Privacy Policy files are specified by their file paths, which should point to the locations of the respective documents on the server. The Legal document is also specified in a similar manner.

### Server Available Modules
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
				"description": "This module handles file uploads, downloads, delete, mirror, file tags, etc."
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
			},
			"payments" : {
				"name": "payments",
				"enabled": false,
				"path": "/payments",
				"methods": ["POST"],
				"description": "This module handles payments, balance, invoices, etc."
			},
			"plugins" : {
				"name": "plugins",
				"enabled": false,
				"path": "/plugins",
				"methods": ["GET"],
				"description": "This module handles plugins, load, unload, etc."
			},
			"relay" : {
				"name": "relay",
				"enabled": false,
				"path": "/relay",
				"methods": ["WebSocket", "GET"],
				"description": "This module handles the Nostr relay"
			},
			"security" : {
				"name": "security",
				"enabled": true,
				"path": "/",
				"methods": ["Library"],
				"description": "This module handles security, ip logs, automatic ban, etc."
			},
		}
```

## Database

The database configuration determines how the application connects to its database. It includes the following fields:

```json
"database": {
	"host": "127.0.0.1",
	"user": "",
	"password": "",
	"database": "",
	"droptables": false // Used internally to drop all tables in the database, do not use in production.
}
```
The database configuration can also be set through environment variables as shown in the snippet below:

```
DATABASE_HOST
DATABASE_USER
DATABASE_PASSWORD
DATABASE_DATABASE
```

## Redis
The Redis configuration is used for caching and session management. It includes the following fields:

```json
"redis": {
	"host": "127.0.0.1",
	"port": "6379",
	"user": "default",
	"password": "",
	"expireTime": 300,
	"instancePrefix": "",
}
```

Redis configuration, including the host, port, username, password, key expiration time and instance prefix. The Redis configuration can also be set through environment variables as shown in the snippet below:

```
REDIS_HOST
REDIS_PORT
REDIS_USER
REDIS_PASSWORD
```

The instancePrefix field is used to set a prefix for all keys in the Redis instance. This is useful for namespacing keys and avoiding key collisions when multiple applications share the same Redis environment.

## Media

```json
"media" : {
		"maxMBfilesize": 100,
		"allowPublicUploads" : true,
		"returnURL" : "",
		"useCDNPrefix" : false,
		"transform" : {
			"enabled" : true,
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
		},
		"mediainspector" : {
			"enabled": false,
			"type" : "local",
			"local" : {
				"modelName": "quentintaranpino/nsfw-image-classifier",
			},
			"remote" : {
				"endpoint": "",
				"apikey": "",
				"secretkey": ""
			},
		},
	},
```

The Media files configuration includes settings for maximum file size (in MB), an image file path for when a file is not found, a setting for whether public uploads are allowed, a custom return URL, and settings for media file transformations.

If the returnURL is not defined in the configuration, the application will default to returning https://<servername>/media. Here, <servername> is the name of the server where the application is hosted. This default URL points to the location where the media files are stored on the server.

The useCDNPrefix field is used to set a cdn subdomain for the media files. Example https://cdn.nostrcheck.com/{filehash}.{extension}. 

### Transform
The transform section contains settings for transforming media files. It includes settings for different types of media, such as images and videos, as well as settings for avatars and banners. This only works with NIP96 uploads and if the "no_transform" option is set to false or null. Blossom spec will not accept transformed files.

### Media inspector
The mediainspector section contains settings for inspecting media files. It includes settings for enabling or disabling the media inspector, as well as settings for local and remote inspection methods. The local method uses a pre-trained model for image classification, while the remote method uses an external API for inspection.

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

## Storage

```json
"storage" : {
		"type": "local",
		"local" : {
			"mediaPath": "media/",
			"tempPath": "tmp/"
		},
		"remote" : {
			"endpoint": "https://<your_r2_account_id>.r2.cloudflarestorage.com",
			"accessKeyId": "<your_r2_access_key_id>",
			"secretAccessKey": "<your_r2_secret_access_key>",
			"region": "auto",
			"s3ForcePathStyle": true,
			"bucketName": "your-bucket-name"
		}
	}
```

The storage configuration includes settings for the storage type and the storage path.

The storage type determines the method of storage used by the application. This could be local file storage, cloud-based storage, or a database. If it's not specified in the configuration, the application will default to using local file storage. This ensures that even if the storage type is not explicitly set, the application will still have a method to store and retrieve data.

The storage path is the location where the data will be stored. This could be a directory on the local machine for file storage, a URL for cloud-based storage, or a database name for database storage. If it's not specified in the configuration, the application will default to a standard location. This ensures that even if the storage path is not explicitly set, the application will know where to store and retrieve data.


## Payments

```json

 "payments": {
        "paymentProvider": "nwc",
        "LNAddress": "quentintaranpino@getalby.com",
        "satoshi": {
            "mediaMaxSatoshi": "5001",
            "registerMaxSatoshi": "9900"
        },
        "paymentProviders": {
            "lnbits": {
                "nodeUrl": "http://localhost:5000",
                "readKey": "123345235235"
            },
            "nwc": {
                "url": "nostr+walletconnect://..."
            }
        },
        "checkInterval": 10000,
        "invoicePaidInterval": "60",
        "allowUnpaidFiles": true,
        "allowUnpaidUploads": true,
        "sendMessageToPubkey": false
    },

```

The payments configuration includes settings for the payment provider, maximum payment amounts, and provider-specific settings.

The paymentProvider field specifies the service used to process payments. If it's not specified in the configuration, the application will need to have a default provider or handle the lack of a provider appropriately.

The satoshi field contains settings for maximum payment amounts for different types of transactions. For example, mediaMaxSatoshi could be the maximum amount of satoshis that a user can pay for a media file, and registerMaxSatoshi could be the maximum amount for user registration.

The LNAddress field is the Lightning Network address for receiving payments.

This configuration ensures that the application has the necessary information to process payments, set payment limits, and interact with the chosen payment provider.

## Register

```json
"register" : {
		"minUsernameLength": 3,
		"maxUsernameLength": 20,
		"minPasswordLength": 12,
		"requireinvite": false,
	},
```
The register configuration includes settings for username and password length, as well as whether an invite is required for registration for new users.

## Security

```json
"security" : {
		"maxDefaultRequestMinute": 150,
		"media" : {
			"maxUploadsMinute": 10,
		},
		"register" : {
			"maxRegisterDay": 2,
		},
		"relay" : {
			"maxMessageMinute": 300,
		},
	},
```

The security configuration includes settings for rate limiting and security measures to protect the server from abuse.
The maxDefaultRequestMinute field specifies the maximum number of requests allowed per minute for all users. This is a general rate limit that applies to all endpoints. If a user exceeds this limit, they may be temporarily blocked from making further requests.

The media field contains settings for media-related requests. The maxUploadsMinute field specifies the maximum number of media uploads allowed per minute. This helps prevent abuse of the media upload functionality.

The register field contains settings for user registration. The maxRegisterDay field specifies the maximum number of registrations allowed per day. This helps prevent abuse of the registration functionality.

The relay field contains settings for Nostr relay-related requests. The maxMessageMinute field specifies the maximum number of messages allowed per minute. This helps prevent abuse of the relay functionality.


## Plugins

```json
	"plugins" : {
		"path": "plugins",
		"list": {
            "activeNIP05": {
                "enabled": false
            },
            "ExamplePlugin": {
                "enabled": false
            },
            "ipCountry": {
                "enabled": false
            },
            "pubkeyFollowers": {
                "enabled": false
            },
            "pubkeyFollowing": {
                "enabled": false
            },
            "pubkeyWoTFollowing": {
                "enabled": false
            }
        }
	},
```

The plugins configuration includes settings for loading and managing plugins. The path field specifies the directory where the plugins are located. The list field contains a list of detected plugins, each with its enabled status. This allows you to enable or disable specific plugins as needed.

The plugins are loaded at startup, and their enabled status determines whether they are active or inactive. If a plugin is enabled, it will be loaded and its functionality will be available in the application. If a plugin is disabled, it will not be loaded and its functionality will not be available. 

See the [Plugins](https://github.com/quentintaranpino/nostrcheck-server/wiki/Plugins) section for more information on how to create and manage plugins.

## Relay

```json
"relay" : {
		"description": "",
		"contact": "",
		"limitation": {
			"max_message_length": 524288,
			"max_subscriptions": 10,
			"max_filters": 5,
			"max_limit": 1000,
			"max_subid_length": 100,
			"max_event_tags": 4000,
			"max_content_length": 20000,
			"min_pow_difficulty": 0,
			"auth_required": false,
			"created_at_lower_limit": 94608000,
			"created_at_upper_limit": 300,
			"max_time_range": 5184000,
		},
		"language_tags": ["en", "es"],
		"tags": [],
		"workers": 2,
		"isolated": false,
	},
```

The relay configuration includes settings for the relay server, including a description, contact information, and limitations on various parameters.

The description field provides a brief overview of the relay server's purpose and functionality.

See the [Relay](https://github.com/quentintaranpino/nostrcheck-server/wiki/Relay) section for more information on how to create and manage a relay server.

## Appearance

```json
"appearance": {
		"serverName" : "",
		"serverDescription" : "",
		"dynamicbackground": {
			"orientation": "to top left",
			"color1": "#007BFF",
			"color2": "#FF66B2",
			"color3": "#FF9933",
			"color1Percent": "0%",
			"color2Percent": "55%",
			"color3Percent": "90%",
			"particles": "astral",
		},
	}
```

The appearance configuration includes settings for the server's name, description, and dynamic background.

The serverName field specifies the name of the server, which is displayed to users on the frontend. 

The serverDescription field provides a brief description of the server's purpose and functionality. 

The dynamicbackground field contains settings for a dynamic background effect on the frontend. It includes options for the orientation of the background gradient, colors, and particle effects. The colors are specified in hexadecimal format, and the color percentages determine how much of each color is used in the gradient.

# Default config 

If the configuration file does not exist, the application will automatically generate a new one with the following structure:

```json
{

	"environment" : "development",
	"multiTenancy": false,
	"autoLogin" : true,
	"server": {
		"host": "localhost",
		"port": 3000,
		"pubkey": "",
		"secretKey": "",
		"tosFilePath" : "resources/tos.md",
		"privacyFilePath" : "resources/privacy.md",
		"legalFilePath" : "resources/legal.md",
		"legal" : {
			"entityType": "individual",
			"email": "",
			"country": "",
			"jurisdiction": "",
			"company": "",
			"address": "",
			"vat": "",
			"phone": ""
		},
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
				"description": "This module handles file uploads, downloads, delete, mirror, file tags, etc."
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
			},
			"payments" : {
				"name": "payments",
				"enabled": false,
				"path": "/payments",
				"methods": ["POST"],
				"description": "This module handles payments, balance, invoices, etc."
			},
			"plugins" : {
				"name": "plugins",
				"enabled": false,
				"path": "/plugins",
				"methods": ["GET"],
				"description": "This module handles plugins, load, unload, etc."
			},
			"relay" : {
				"name": "relay",
				"enabled": false,
				"path": "/relay",
				"methods": ["WebSocket", "GET"],
				"description": "This module handles the Nostr relay"
			},
			"security" : {
				"name": "security",
				"enabled": true,
				"path": "/",
				"methods": ["Library"],
				"description": "This module handles security, ip logs, automatic ban, etc."
			},
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
		"expireTime": 300,
		"instancePrefix": "",
	},
	"media" : {
		"maxMBfilesize": 100,
		"allowPublicUploads" : true,
		"returnURL" : "",
		"useCDNPrefix" : false,
		"transform" : {
			"enabled" : true,
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
		},
		"mediainspector" : {
			"enabled": false,
			"type" : "local",
			"local" : {
				"modelName": "quentintaranpino/nsfw-image-classifier",
			},
			"remote" : {
				"endpoint": "",
				"apikey": "",
				"secretkey": ""
			},
		},
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
		"maxAge": 3600000
	},
	"storage" : {
		"type": "local",
		"local" : {
			"mediaPath": "files/",
			"tempPath": "tmp/"
		},
		"remote" : {
			"endpoint": "https://<your_r2_account_id>.r2.cloudflarestorage.com",
			"accessKeyId": "<your_r2_access_key_id>",
			"secretAccessKey": "<your_r2_secret_access_key>",
			"region": "auto",
			"s3ForcePathStyle": true,
			"bucketName": "your-bucket-name"
		}
	},
	"payments" : {
		"LNAddress": "",
		"paymentProvider": "lnbits",
		"invoicePaidInterval": 60,
		"satoshi" : {
				"mediaMaxSatoshi": 1000,
				"registerMaxSatoshi": 1000,
		},
		"allowUnpaidUploads": true,
		"sendMessageToPubkey": false,
		"paymentProviders": {
			"lnbits": {
				"nodeUrl": "",
				"readKey": "",
			},
			"nwc": {
				"url": "",
			},
		}

	},
	"register" : {
		"minUsernameLength": 3,
		"maxUsernameLength": 20,
		"minPasswordLength": 12,
		"requireinvite": false,
	},
	"security" : {
		"maxDefaultRequestMinute": 150,
		"media" : {
			"maxUploadsMinute": 10,
		},
		"register" : {
			"maxRegisterDay": 2,
		},
		"relay" : {
			"maxMessageMinute": 300,
		},
	},
	"plugins" : {
		"path": "plugins",
		"list": {
		},
	},
	"relay" : {
		"description": "",
		"contact": "",
		"limitation": {
			"max_message_length": 524288,
			"max_subscriptions": 10,
			"max_filters": 5,
			"max_limit": 1000,
			"max_subid_length": 100,
			"max_event_tags": 4000,
			"max_content_length": 20000,
			"min_pow_difficulty": 0,
			"auth_required": false,
			"created_at_lower_limit": 94608000,
			"created_at_upper_limit": 300,
			"max_time_range": 5184000,
		},
		"language_tags": ["en", "es"],
		"tags": [],
		"workers": 2,
		"isolated": false,
	},
	"appearance": {
		"serverName" : "",
		"serverDescription" : "",
		"dynamicbackground": {
			"orientation": "to top left",
			"color1": "#007BFF",
			"color2": "#FF66B2",
			"color3": "#FF9933",
			"color1Percent": "0%",
			"color2Percent": "55%",
			"color3Percent": "90%",
			"particles": "astral",
		},
	}
}

```
This automatic generation of a configuration file ensures that the application can run with default settings even if a configuration file is not provided.