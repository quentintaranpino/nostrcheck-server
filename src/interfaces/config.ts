
interface IModules {
	[key: string]: IModule;
}

interface IModule {
	enabled: boolean;
	path: string;
	method: string;
	comments: string;
}

const necessaryKeys = [	
	"server.host", 
	"server.port", 
	"server.pubkey", 
	"server.secretKey", 
	"server.tosFilePath", 
	"database.host",
	"database.user",
	"database.password",
	"database.database"
]

export { IModules, IModule, necessaryKeys}