import app from "../app.js";
import { domainInfo } from "../interfaces/domains.js";
import { isModuleEnabled } from "./config.js";
import { dbMultiSelect } from "./database.js";

const getAvailableDomains = async (): Promise<{ [key: string]: domainInfo }> => {
    const domains = await dbMultiSelect(["domain", "requireinvite", "requirepayment", "maxsatoshi"], "domains", "active = ?", ["1"], false);
    if (domains.length == 0) {
        return {};
    }
    const domainMap: { [key: string]: domainInfo } = {};
    domains.forEach((row) => {
        domainMap[row.domain] = {
            requireinvite: Boolean(row.requireinvite),
            requirepayment: isModuleEnabled("payments", app) ? Boolean(row.requirepayment) : false,
			maxsatoshi: row.maxsatoshi != 0? row.maxsatoshi : app.get("config.payments")["satoshi"]["registerMaxSatoshi"],
        };
    });
    return domainMap;
};

const getAvailiableUsers = async (domain:string): Promise<JSON[]> => {

	const users = await dbMultiSelect(["username", "hex"], "registered","domain = ?",[domain],false);
	if (users.length == 0) {return [];}

	return users;

};

const getDomainInfo = async (domain: string): Promise<domainInfo | ""> => {
	const domains = await dbMultiSelect(["domain", "requireinvite", "requirepayment", "maxsatoshi"], "domains", "domain = ?", [domain], false);
	if (domains.length == 0) {return "";}

	return {
		requireinvite: Boolean(domains[0].requireinvite),
		requirepayment: isModuleEnabled("payments", app) ? Boolean(domains[0].requirepayment) : false,
		maxsatoshi: domains[0].maxsatoshi != 0? domains[0].maxsatoshi : app.get("config.payments")["satoshi"]["registerMaxSatoshi"],
	};
}

export { getAvailableDomains, getAvailiableUsers, getDomainInfo };