import { getLocalFolder } from "../storage/local.js";
import { isModuleEnabled } from "../config.js";
import * as fs from 'fs';
import { logger } from "../logger.js";
import path from 'path';
import { pathToFileURL } from 'url';
import { plugin, pluginContext, pluginData } from "../../interfaces/plugins.js";
import { Application } from "express";
import * as NIP01 from "../nostr/NIP01.js";
import * as NIP19 from "../nostr/NIP19.js";
import * as registered from "../register.js";
import { redisPluginsClient } from "../redis.js";

const initPlugins = async (app: Application): Promise<boolean> => {
    app.set("plugins", []);

    if (!isModuleEnabled("plugins", app)) {
        return Promise.resolve(false);
    }

    if (app.get("config.plugins")["path"] === undefined) {
        logger.error(`initPlugins - No plugins path defined in config`);
        return Promise.resolve(false);
    }

    const pluginsPath = getLocalFolder(app.get("config.plugins")["path"]);
    if (!pluginsPath) {
        return Promise.resolve(false);
    }

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
                    app.get("plugins").push(pluginInstance);
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

    return Promise.resolve(true);
};


const listPlugins = (app: Application): string[] => {
    return app.get("plugins").map((p: { order: number, enabled: boolean, name: string, module: string }) => ({ order: p.order, enabled: p.enabled, name: p.name, module: p.module }));
}

const executePlugins = async (input: pluginData, app: Application, moduleFilter: string): Promise<boolean> => {

    if (!isModuleEnabled("plugins", app)) return Promise.resolve(true);

    const plugins: plugin[] = app.get("plugins")
        .filter((p: plugin) => p.module === moduleFilter) 
        .sort((a: plugin, b: plugin) => a.order - b.order);

    let result = false;

    const context: pluginContext = {
        app: app,
        logger: logger,
        redis: redisPluginsClient,
        nostr: {
            NIP01: NIP01,
            NIP19: NIP19
        },
        registered: registered
    };

    if (plugins.length === 0) return Promise.resolve(true);

    logger.info(`executePlugins - Executing plugins for module '${moduleFilter}'`);

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