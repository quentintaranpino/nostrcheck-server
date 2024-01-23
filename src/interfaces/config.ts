
interface IEndpoints {
	[key: string]: IEndpoint;
}

interface IEndpoint {
	enabled: boolean;
	path: string;
	method: string;
	comments: string;
}

export { IEndpoints, IEndpoint}