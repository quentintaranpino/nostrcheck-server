
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

  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;
  
  let value: any;
  if (domainId && configStore.tenants[domainId]) {
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
  // Fallback: configuración global
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

/**
 * Actualiza un valor de configuración en el store en memoria y lo persiste.
 * Si se proporciona un domainId, actualiza la configuración específica para ese dominio en la DB;
 * de lo contrario, actualiza la configuración global y la persiste en el archivo JSON.
 *
 * @param domainId El ID del dominio o null para la global.
 * @param keyPath Un arreglo de claves que define la ruta, ej: ["register", "minUsernameLength"].
 * @param newValue El nuevo valor a asignar.
 * @returns Un booleano indicando si la actualización fue exitosa.
 */
const setConfig = async (domain: string, keyPath: string[], newValue: string | boolean | number): Promise<boolean> => {

  const domainId = domain ? configStore.domainMap.domainToId[domain] : null;

  if (!keyPath || keyPath.length === 0) {
    return false;
  }
  if (newValue === undefined) {
    return false;
  }

  // Seleccionamos el target: overrides o global.
  let target;
  if (domainId && configStore.tenants[domainId]) {
    target = configStore.tenants[domainId];
  } else {
    target = configStore.global;
  }
  
  // Recorremos la ruta hasta la penúltima clave
  let current = target;
  for (let i = 0; i < keyPath.length - 1; i++) {
    if (current[keyPath[i]] === undefined || current[keyPath[i]] === null) {
      current[keyPath[i]] = {};
    }
    current = current[keyPath[i]];
  }
  current[keyPath[keyPath.length - 1]] = newValue;

  

  // Persistencia
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
      // Para la configuración global, actualizamos el archivo sin llamar a app.set()
      const key = keyPath.join(".");
      const updated = await updateLocalConfigKey(key, newValue.toString());
      // Opcional: podrías recargar la configuración global desde el archivo y actualizar configStore.global
      return updated;
    } catch (error) {
      console.error("Error updating global config in file", error);
      return false;
    }
  }
};



export { configStore, initGlobalConfig, getConfig, setConfig };