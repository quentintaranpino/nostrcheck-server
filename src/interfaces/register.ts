import { ResultMessagev2 } from "./server";

interface RegisteredUsernameResult {
	username: string;
	hex: string;
}

interface registerFormResult extends ResultMessagev2 {
	otc: boolean;
	payment_request: string;
	satoshi: number;
}

export {RegisteredUsernameResult, registerFormResult};
