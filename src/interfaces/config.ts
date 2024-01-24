
interface IModules {
	[key: string]: IModule;
}

interface IModule {
	enabled: boolean;
	path: string;
	method: string;
	comments: string;
}

export { IModules, IModule}