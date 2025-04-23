
import { TenantInfo } from "../interfaces/tenants.js";
import { getPublicTenantConfig } from "./config/tenant.js";
import { dbMultiSelect } from "./database.js";

const getAvailableDomains = async (): Promise<{ [key: string]: TenantInfo }> => {
    const domains = await dbMultiSelect(["id", "domain"], "domains", "active = ?", ["1"], false);
    if (domains.length == 0) {
        return {};
    }
    const domainMap: { [key: string]: TenantInfo } = {};
    
    await Promise.all(
        domains.map(async (row: any) => {
            const tenantConfig = await getPublicTenantConfig(row.domain);
            if (tenantConfig) {
                domainMap[row.domain] = tenantConfig;
            }
        })
    );
        
    return domainMap;
};

const getAvailiableUsers = async (domain:string): Promise<JSON[]> => {

	const users = await dbMultiSelect(["id","username", "hex"], "registered","domain = ? and active = ? ",[domain, "1"],false);
	if (users.length == 0) {return [];}

	return users;

};

export { getAvailableDomains, getAvailiableUsers };