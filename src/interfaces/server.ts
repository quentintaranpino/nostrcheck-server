interface ResultMessage {
	result: boolean;
	description: string;
}

interface ResultMessagev2 {
	status: string, 
	message: string,
}

export { ResultMessage, ResultMessagev2 };