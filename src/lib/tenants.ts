import { TenantInfo } from "../interfaces/tenants.js";
import { isModuleEnabled } from "./config.js";
import { dbMultiSelect } from "./database.js";
import app from "../app.js";

const getTenantConfig = async (domain: string): Promise<TenantInfo | null> => {

    if (app.get("config.server")["multiTenancy"] == false) {
        const tenantInfo : TenantInfo = {
            maxsatoshi: app.get("config.payments")["satoshi"]["registerMaxSatoshi"],
            requireinvite: app.get("config.register")["requireinvite"],
            requirepayment: await isModuleEnabled("payments", app) ? app.get("config.register")["requirepayment"] : false,
            minUsernameLength: app.get("config.register")["minUsernameLength"],
            maxUsernameLength: app.get("config.register")["maxUsernameLength"],

        };
        return tenantInfo;
    }

	const tenantData = await dbMultiSelect(["domain", "requireinvite", "requirepayment", "maxsatoshi"], "domains", "domain = ?", [domain], false);
	if (tenantData.length == 0) {
        return null;
    }

    return {
        requireinvite: Boolean(tenantData[0].requireinvite),
        requirepayment: isModuleEnabled("payments", app)
          ? (tenantData[0].requirepayment !== undefined 
                ? Boolean(tenantData[0].requirepayment) 
                : app.get("config.register")["requirepayment"])
          : false,
        maxsatoshi: tenantData[0].maxsatoshi != 0
          ? tenantData[0].maxsatoshi 
          : app.get("config.payments")["satoshi"]["registerMaxSatoshi"],
        minUsernameLength: tenantData[0].minUsernameLength != 0
          ? tenantData[0].minUsernameLength 
          : app.get("config.register")["minUsernameLength"],
        maxUsernameLength: tenantData[0].maxUsernameLength != 0
          ? tenantData[0].maxUsernameLength 
          : app.get("config.register")["maxUsernameLength"],
    };
};

export { getTenantConfig };