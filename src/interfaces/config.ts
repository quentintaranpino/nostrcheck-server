
interface Modules {
	[key: string]: Module;
}

interface Module {
    enabled: boolean;
    path: string;
    methods: string[];
    description: string;
    name: string;
}

const necessaryKeys = [	
	"server.host", 
	"server.port", 
	"server.pubkey", 
	"server.secretKey", 
	"server.tosFilePath", 
	"server.privacyFilePath", 
	"database.host",
	"database.user",
	"database.password",
	"database.database"
]

const defaultConfig = {

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
		"maxDefaultRequestMinute": 300,
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
			"max_message_length": 256000,
			"max_subscriptions": 10,
			"max_filters": 5,
			"max_limit": 1000,
			"max_subid_length": 100,
			"max_event_tags": 500,
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
		"siteName": "",
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
		"pages": {
			"home":     { 	"title": "{server.host} — Home",
							"description": "",
							"noindex": false,
							"pageTitle" : "",
							"pageSubtitle" : "",
			},
			"login":    { 	"title": "{server.host} — Login",
							"description": "",
							"noindex": false,
			},
			"register": { 	"title": "{server.host} — Register",
							"description": "",
							"noindex": false
			},
			"gallery":  {	"title": "{server.host} — Gallery",
							"description": "",
							"noindex": false
			},
			"directory": { 	"title": "{server.host} — Directory",
							"description": "",
							"noindex": false
			},
			"converter": { 	"title": "{server.host} — Converter",
							"description": "",
							"noindex": false
			},
			"dashboard": { 	"title": "{server.host} — Dashboard",
							"description": "",
							"noindex": true
			},
			"settings":  { 	"title": "{server.host} — Settings",
							"description": "",
							"noindex": true
			},
			"docs":      { 	"title": "{server.host} — Docs",
							"description": "",
							"noindex": false
			},
			"tos":       { 	"title": "{server.host} — Terms",
							"description": "",
							"noindex": false
			},
			"privacy":   { 	"title": "{server.host} — Privacy",
							"description": "",
							"noindex": false
			},
			"legal":     { 	"title": "{server.host} — Legal",
							"description": "",
							"noindex": false
			},
			"profile":   { 	"title": "{server.host} — Profile",
							"description": "",
							"noindex": false
			},
			"cdn":     { 	"title": "{server.host} — CDN",
							"description": "",
							"noindex": true
			},
			"relay":     { 	"title": "{server.host} — Relay",
							"description": "",
							"noindex": false
			}
		}
	}
}

const localPath = "./config/local.json";

interface ConfigStore {
	global: any;
	tenants: { [domainId: string]: any };
	domainMap: {
		idToDomain: { [id: string]: string };
		domainToId: { [domain: string]: string };
	};
}
		
const configStore : ConfigStore = {
	global: {},
	tenants: {},
	domainMap: {
		idToDomain: {},  
		domainToId: {},
	}
};



export { Modules, Module, necessaryKeys, defaultConfig, localPath, configStore};