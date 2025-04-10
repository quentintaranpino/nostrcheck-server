
import { configStore, Module } from "../../interfaces/config.js";
import { loadConfigOptions, updateLocalConfigKey } from "./local.js";
import { loadTenants } from "./tenant.js";

const initGlobalConfig = async (): Promise<void> => {

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
        version: process.env.npm_package_version ?? "0.0",
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
    loadTenants()
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

const getConfig = (domain: string | null, keyPath: string[]): any => {
  const multiTenancy = configStore.global?.multiTenancy;
  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;

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
      const updated = await updateLocalConfigKey(key, newValue);
      return updated;
    } catch (error) {
      console.error("Error updating global config in file", error);
      return false;
    }
  }
};

const getActiveModules = (domain: string | null = null): Module[] => {
	const domainId = domain ? configStore.domainMap.domainToId[domain] : null;

	const globalModules = configStore.global?.server?.availableModules || {};
	const tenantModules = domainId ? configStore.tenants?.[domainId]?.server?.availableModules || {} : {};

	const mergedModules: Record<string, Module> = { ...globalModules };

	for (const mod in tenantModules) {
		if (!mergedModules[mod]) mergedModules[mod] = tenantModules[mod];
		else mergedModules[mod] = { ...mergedModules[mod], ...tenantModules[mod] };
	}

	const activeModules = Object.entries(mergedModules)
		.filter(([_, module]) => module.enabled === true)
		.map(([_, module]) => module);

	// Always add logger module
	activeModules.push({
		name: "logger",
		enabled: true,
		path: "/",
		methods: ["Library"],
		description: "This module manages the server logs engine."
	});

	return activeModules;
}

const isModuleEnabled = (moduleName: string, domain: string | null = null): boolean => {
	const availableModules = getActiveModules(domain);
	const mod = availableModules.find((module) => module.name === moduleName);
	return mod ? mod.enabled : false;
}


export { configStore, initGlobalConfig, getConfig, setConfig, isModuleEnabled, getActiveModules };