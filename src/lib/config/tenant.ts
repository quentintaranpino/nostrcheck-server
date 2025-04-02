import { configStore } from "./core.js";

const loadTenantConfig = async (domainId: string): Promise<any> => {
  try {
    const query = "SELECT config FROM tenantconfig WHERE domainid = ?";
    const { dbSelect } = await import("../database.js");
    const configString = await dbSelect(query, "config", [domainId]);
    if (configString && typeof configString === "string" && configString !== "") {
      return JSON.parse(configString);
    }
    return null;
  } catch (error) {
    console.error("Error loading tenant config for domainId", domainId, error);
    return null;
  }
};

const updateTenantConfig = async (domainId: string, config: any): Promise<boolean> => {
  try {
    const configJson = JSON.stringify(config);
    const { dbUpsert } = await import("../database.js");
    const result = await dbUpsert("tenantconfig", { domainid: domainId, config: configJson }, ["domainid"]);
    return result > 0;
  } catch (error) {
    console.error("Error updating tenant config for domainId", domainId, error);
    return false;
  }
};
const loadTenants = async (): Promise<void> => {
      const { dbMultiSelect } = await import("../database.js");
      const domainRows = await dbMultiSelect(["id", "domain"], "domains", "active = ?", ["1"], false);
      for (const row of domainRows) {
        const tenantConfig = await loadTenantConfig(row.id);5
        configStore.tenants[row.id] = tenantConfig ?? {};
        configStore.domainMap.idToDomain[row.id] = row.domain;
        configStore.domainMap.domainToId[row.domain] = row.id;
      }
};

export { updateTenantConfig, loadTenants };