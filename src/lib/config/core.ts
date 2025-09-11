
import { configStore, Module } from "../../interfaces/config.js";
import { loadConfigOptions, updateLocalConfigKey } from "./local.js";

const initGlobalConfig = async (): Promise<void> => {

    const versionConfig = process.env.npm_package_version ?? "0.0";
    const environmentConfig = process.env.NODE_ENV ?? await loadConfigOptions("environment");
    const multiTenancyConfig = await loadConfigOptions("multiTenancy");
    const autoLoginConfig = await loadConfigOptions("autoLogin");
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
    const pluginsConfig   = await loadConfigOptions("plugins");
    const relayConfig     = await loadConfigOptions("relay");
    const appearanceConfig = await loadConfigOptions("appearance");

    const globalConfig = {
        version: versionConfig,
        environment: environmentConfig,
        multiTenancy: multiTenancyConfig,
        autoLogin: autoLoginConfig,
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
        plugins: pluginsConfig,
        relay: relayConfig,
        appearance: appearanceConfig,
    };

    configStore.global = globalConfig;
};

const deepMerge = (base: any, override: any): any => {
  if (typeof base !== 'object' || base === null) return override;
  if (typeof override !== 'object' || override === null) return base;

  const result: any = Array.isArray(base) ? [...base] : { ...base };

  for (const key in override) {
    if (override.hasOwnProperty(key)) {
      if (key in base) {
        result[key] = deepMerge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
  }

  return result;
};

/**
 * * Get a configuration value for a specific tenant or globally.
 * * @param {string | null} tenant - The tenant (domain) for which to get the configuration. If null, gets the global configuration.
 * * @param {string[]} keyPath - The path to the configuration key as an array of strings.
 * * @returns {any} - The configuration value, or undefined if not found.
 * */
const getConfig = (tenant: string | null, keyPath: string[]): any => {

  const multiTenancy = configStore.global?.multiTenancy;
  // let normalizedTenant: string | null = tenant ? tenant.toLowerCase() : null;
  // if (normalizedTenant) {
  //   while (
  //     normalizedTenant.split(".").length > 2 &&
  //     !configStore.domainMap.domainToId[normalizedTenant]
  //   ) {
  //     normalizedTenant = normalizedTenant.split(".").slice(1).join(".");
  //   }
  // }

  // const domainId = normalizedTenant ? configStore.domainMap.domainToId[normalizedTenant] : null;
  const domainId = tenant ? configStore.domainMap.domainToId[tenant] : null;

  let globalValue = configStore.global;
  for (const key of keyPath) {
    if (globalValue && typeof globalValue === "object" && key in globalValue) {
      globalValue = globalValue[key];
    } else {
      globalValue = undefined;
      break;
    }
  }

  let domainValue;
  if (multiTenancy && domainId && configStore.tenants[domainId]) {
    domainValue = configStore.tenants[domainId];
    for (const key of keyPath) {
      if (domainValue && typeof domainValue === "object" && key in domainValue) {
        domainValue = domainValue[key];
      } else {
        domainValue = undefined;
        break;
      }
    }
  }

  if (globalValue === undefined && domainValue === undefined) return undefined;
  if (domainValue === undefined) return globalValue;
  if (globalValue === undefined) return domainValue;

  return deepMerge(globalValue, domainValue);
};

/**
 * * Set a configuration value for a specific tenant or globally.
 * * @param {string} domain - The domain for which to set the configuration. If null, sets the global configuration.
 * * @param {string[]} keyPath - The path to the configuration key as an array of strings.
 * * @param {string | boolean | number | object | undefined} newValue - The new value to set for the configuration key.
 * * @returns {Promise<boolean>} - Returns true if the configuration was successfully set, false otherwise.
 * */
const setConfig = async (tenant: string, keyPath: string[], newValue: string | boolean | number | object | undefined): Promise<boolean> => {

  const domainId = tenant ? configStore.domainMap.domainToId[tenant] : null;

  if (!keyPath || keyPath.length === 0) {
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
      const { dbUpsert } = await import("../database/core.js");
      const result = await dbUpsert("tenantconfig", { domainid: domainId, config: configJson }, ["domainid"]);
      return result > 0;
    } catch (error) {
      console.error("Error updating config for domainId", domainId, error);
      return false;
    }
  } else {
    try {
      const key = keyPath.join(".");
      const updated = await updateLocalConfigKey(key, newValue);
      return updated;
    } catch (error) {
      console.error("Error updating global config in file", error);
      return false;
    }
  }
};

const getModules = (domain: string | null = null, onlyActive : boolean): Module[] => {

  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;

  const globalModules = configStore.global?.server?.availableModules || {};
  const tenantModules = domainId ? configStore.tenants?.[domainId]?.server?.availableModules || {} : {};

  const merged: Record<string, Module> = { ...globalModules };
  for (const name in tenantModules) {
    merged[name] = {
      ...merged[name],
      ...tenantModules[name],
    };
  }

  let modules = Object.values(merged);
  if (onlyActive) {
    modules = modules.filter((m) => m.enabled);
  }

  // Always add the logger module
  modules.push({
    name: "logger",
    enabled: true,
    path: "/",
    methods: ["Library"],
    description: "This module manages the server logs engine.",
  });

  return modules;
};

const isModuleEnabled = (moduleName: string, tenant: string): boolean => {
  return getModules(tenant, true).some((m) => m.name === moduleName);
}

const getModuleInfo = (moduleName: string, tenant: string): Module | undefined => {
  const modules = getModules(tenant, false);
  return modules.find((m) => m.name === moduleName);
}

const getTenants = (): { id: string; domain: string }[] => {
  const result: { id: string; domain: string }[] = [];

  const ids = configStore?.domainMap?.idToDomain || {};
  for (const id in ids) {
    result.push({ id, domain: ids[id] });
  }

  return result;
};


const getFullConfig = (domain: string | null = null): any => {
  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;

  if (domainId && configStore.tenants[domainId]) {
    return deepMerge(configStore.global, configStore.tenants[domainId]);
  }

  return configStore.global;
};

export { configStore, initGlobalConfig, getConfig, getFullConfig, setConfig, isModuleEnabled, getModules, getModuleInfo, getTenants };