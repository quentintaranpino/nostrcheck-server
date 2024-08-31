import { ResultMessagev2 } from "./server";

interface nostrAddressResult {
	names : {
		[username: string]: string;
	};
}

interface registerFormResult extends ResultMessagev2 {
	otc: boolean;
	payment_request: string;
	satoshi: number;
}

export {nostrAddressResult, registerFormResult};
