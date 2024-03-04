
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
	"database.host",
	"database.user",
	"database.password",
	"database.database"
]

export { Modules, Module, necessaryKeys}