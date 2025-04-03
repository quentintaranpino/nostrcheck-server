
import { configStore } from "../../interfaces/config.js";
import { loadConfigOptions, updateLocalConfigKey } from "./local.js";
import { loadTenants } from "./tenant.js";

const initGlobalConfig = async (): Promise<void> => {

    const serverConfig    = await loadConfigOptions("server");
    const mediaConfig     = await loadConfigOptions("media");
    const loggerConfig    = await loadConfigOptions("logger");
    const redisConfig     = await loadConfigOptions("redis");
    const storageConfig   = await loadConfigOptions("storage");
    const paymentsConfig  = await loadConfigOptions("payments");
    const registerConfig  = await loadConfigOptions("register");
    const sessionConfig   = await loadConfigOptions("session");
    const securityConfig  = await loadConfigOptions("security");
    const databaseConfig  = await loadConfigOptions("database");
    const environmentConfig = process.env.NODE_ENV ?? await loadConfigOptions("environment");
    const pluginsConfig   = await loadConfigOptions("plugins");
    const relayConfig     = await loadConfigOptions("relay");

    const globalConfig = {
        server: serverConfig,
        media: mediaConfig,
        logger: loggerConfig,
        redis: redisConfig,
        storage: storageConfig,
        payments: paymentsConfig,
        register: registerConfig,
        session: sessionConfig,
        security: securityConfig,
        database: databaseConfig,
        environment: environmentConfig,
        plugins: pluginsConfig,
        relay: relayConfig,
    };

    configStore.global = globalConfig;
    loadTenants()
};

const getConfig = (domain : string | null, keyPath: string[]): any => {

  const multiTenancy = configStore.global?.server?.multiTenancy;
  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;
  
  let value: any;
  if (multiTenancy && domainId && configStore.tenants[domainId]) {
    value = configStore.tenants[domainId];
    for (const key of keyPath) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined) return value;
  }
  value = configStore.global;
  for (const key of keyPath) {
    if (value && typeof value === "object" && key in value) {
      value = value[key];
    } else {
      value = undefined;
      break;
    }
  }
  return value;
};

const setConfig = async (domain: string, keyPath: string[], newValue: string | boolean | number): Promise<boolean> => {

  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;

  if (!keyPath || keyPath.length === 0) {
    return false;
  }
  if (newValue === undefined) {
    return false;
  }

  let target;
  if (domainId && configStore.tenants[domainId]) {
    target = configStore.tenants[domainId];
  } else {
    target = configStore.global;
  }
  
  let current = target;
  for (let i = 0; i < keyPath.length - 1; i++) {
    if (current[keyPath[i]] === undefined || current[keyPath[i]] === null) {
      current[keyPath[i]] = {};
    }
    current = current[keyPath[i]];
  }
  current[keyPath[keyPath.length - 1]] = newValue;

  if (domainId) {
    try {
      const configJson = JSON.stringify(configStore.tenants[domainId]);
      const { dbUpsert } = await import("../database.js");
      const result = await dbUpsert("tenantconfig", { domainid: domainId, config: configJson }, ["domainid"]);
      return result > 0;
    } catch (error) {
      console.error("Error updating config for domainId", domainId, error);
      return false;
    }
  } else {
    try {
      const key = keyPath.join(".");
      const updated = await updateLocalConfigKey(key, newValue.toString());
      return updated;
    } catch (error) {
      console.error("Error updating global config in file", error);
      return false;
    }
  }
};

export { configStore, initGlobalConfig, getConfig, setConfig };