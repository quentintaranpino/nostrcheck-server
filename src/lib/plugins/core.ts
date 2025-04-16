
import * as fs from 'fs';
import { Application } from "express";
import path from 'path';
import { pathToFileURL } from 'url';
import { logger } from "../logger.js";
import { plugin, pluginContext, pluginData, pluginStore } from "../../interfaces/plugins.js";
import * as NIP01 from "../nostr/NIP01.js";
import * as NIP19 from "../nostr/NIP19.js";
import * as registered from "../register.js";
import { RedisService } from "../redis.js";
import { getLocalFolder } from "../storage/local.js";
import { getConfig, getFullConfig, isModuleEnabled, setConfig } from '../config/core.js';

let redisPlugins: RedisService;

const initPlugins = async (tenant: string): Promise<boolean> => {

    redisPlugins = new RedisService({
        host: process.env.REDIS_HOST || getConfig(null, ["redis", "host"]),
        port: process.env.REDIS_PORT || getConfig(null, ["redis", "port"]),
        user: process.env.REDIS_USER || getConfig(null, ["redis", "user"]),
        password: process.env.REDIS_PASSWORD || getConfig(null, ["redis", "password"]),
        defaultDB: 1 
    });
    await redisPlugins.init();

    if (!isModuleEnabled("plugins", tenant)) {
        return Promise.resolve(false);
    }

    if (getConfig(null, ["plugins", "path"]) === undefined) {
        logger.error(`initPlugins - No plugins path defined in config`);
        return Promise.resolve(false);
    }

    const pluginsPath = getLocalFolder(getConfig(null, ["plugins", "path"]));
    if (!pluginsPath) {
        return Promise.resolve(false);
    }

    pluginStore[tenant] =  [];
    const pluginList = getConfig(tenant, ["plugins", "list"]) || {};
    const foundPluginNames = new Set<string>();

    for (const p of fs.readdirSync(pluginsPath)) {
        if (p.split('.').pop() !== "js") continue;
        logger.info(`initPlugins - Found plugin: ${p}`);
        const fullPath = path.join(pluginsPath, p);
        const modulePath = pathToFileURL(fullPath).href;

        try {
            const pluginModule = await import(`${modulePath}?${Date.now()}`);

            if (pluginModule.default && typeof pluginModule.default === 'function') {
                const pluginInstance = pluginModule.default();

                if (pluginInstance && typeof pluginInstance.execute === 'function' && typeof pluginInstance.module === 'string') {
                    
                    if (!pluginStore[tenant]){
                        pluginStore[tenant] = [];
                    } 

                    if (!(pluginInstance.name in pluginList)) {
                        await setConfig(tenant, ["plugins", "list", pluginInstance.name], {
                            enabled: false,
                        });
                    }

                    pluginInstance.enabled = getConfig(tenant, ["plugins", "list", pluginInstance.name, "enabled"]) ?? false;

                    pluginStore[tenant].push(pluginInstance);
                    foundPluginNames.add(pluginInstance.name); 

                    logger.info(`initPlugins - Plugin ${p} loaded successfully in module '${pluginInstance.module}'`);
                } else {
                    logger.warn(`initPlugins - Plugin ${p} does not provide a valid structure (missing 'execute' function or 'module' field)`);
                }
            } else {
                logger.warn(`initPlugins - Plugin ${p} does not export a default function`);
            }
        } catch (err) {
            logger.error(`initPlugins - Error loading plugin ${p}: ${err}`);
        }
    }

    for (const pluginName in pluginList) {
        if (!foundPluginNames.has(pluginName)) {
            logger.info(`initPlugins - Removing missing plugin '${pluginName}' from config`);
            await setConfig(tenant, ["plugins", "list", pluginName], undefined); // 👈 esto elimina la clave correctamente
        }
    }

    return Promise.resolve(true);
};

const listPlugins = async (tenant: string): Promise<{ order: number; enabled: boolean; name: string; module: string; }[]> => {
    await initPlugins(tenant)
    return (pluginStore[tenant] || []).map((p) => ({
        order: p.order,
        enabled: p.enabled,
        name: p.name,
        module: p.module
    }));
};

const executePlugins = async (input: pluginData, tenant: string): Promise<boolean> => {

    if (!isModuleEnabled("plugins", tenant)) return Promise.resolve(true);

    const plugins: plugin[] = (pluginStore[tenant] || [])
        .filter((p) => p.module === input.module)
        .sort((a, b) => a.order - b.order);

    if (plugins.length === 0) return Promise.resolve(true);

    const context: pluginContext = {
        config: getFullConfig(tenant),
        logger: logger,
        redis: redisPlugins,
        nostr: {
            NIP01: NIP01,
            NIP19: NIP19
        },
        registered: registered
    };

    logger.info(`executePlugins - Executing plugins for module '${input.module} and tenant '${tenant}'`);

    let result = false;

    for (const plugin of plugins) {
        if (plugin.enabled !== true) {
            result = true;
            continue;
        }
        try {
            logger.info(`executePlugins - Executing plugin ${plugin.name} for module '${plugin.module}'`);
            result = await plugin.execute(input, context);
            if (typeof result !== 'boolean') result = false;
            logger.debug(`executePlugins - Plugin ${plugin.name} returned ${result}`);
            if (result === false) break;
        } catch (err) {
            logger.error(`executePlugins - Error executing plugin ${plugin.name}: ${err}`);
            result = false;
        }
    }

    return Promise.resolve(result);
};

export { initPlugins, listPlugins, executePlugins };