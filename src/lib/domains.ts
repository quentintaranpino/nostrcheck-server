import { domainInfo } from "../interfaces/domains.js";
import { dbMultiSelect } from "./database.js";

const getAvailableDomains = async (): Promise<{ [key: string]: domainInfo }> => {
    const domains = await dbMultiSelect(["domain", "requireinvite", "requirepayment"], "domains", "active = ?", ["1"], false);
    if (domains.length == 0) {
        return {};
    }
    const domainMap: { [key: string]: domainInfo } = {};
    domains.forEach((row) => {
        domainMap[row.domain] = {
            requireinvite: Boolean(row.requireinvite),
            requirepayment: Boolean(row.requirepayment)
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
	const domains = await dbMultiSelect(["domain", "requireinvite", "requirepayment"], "domains", "domain = ?", [domain], false);
	if (domains.length == 0) {return "";}
	return {
		requireinvite: Boolean(domains[0].requireinvite),
		requirepayment: Boolean(domains[0].requirepayment)
	};
}

export { getAvailableDomains, getAvailiableUsers, getDomainInfo };