
import * as fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { logger } from "../logger.js";
import { plugin, pluginContext, pluginData, pluginStore } from "../../interfaces/plugins.js";
import * as NIP01 from "../nostr/NIP01.js";
import * as NIP19 from "../nostr/NIP19.js";
import * as registered from "../register.js";
import { getLocalFolder } from "../storage/local.js";
import { getConfig, getFullConfig, isModuleEnabled, setConfig } from '../config/core.js';
import { initRedis } from '../redis/client.js';

const redisPlugins = await initRedis (1, false);

// Config subtrees hidden from plugins. These carry credentials (session
// signing secret, redis/database/storage/payments/lightning creds, the webhook
// signing secret) or the server's nostr private key. Anything not listed here
// is considered public-ish config that a plugin may legitimately read.
const pluginConfigBlocklist: string[] = [
	"session",
	"redis",
	"database",
	"storage",
	"lightning",
	"payments",
	"notifications",
	"server.secretKey",
	// Still listed after the remote inspector goes: the keys stay in local.json.
	"media.mediainspector.remote",
];

/**
 * Returns a deep clone of the tenant config with the blocklisted paths
 * removed, so a plugin never sees live credentials or the server's nostr
 * secret key through its context.
 */
const sanitizePluginConfig = (config: any): any => {
	const cloned = JSON.parse(JSON.stringify(config || {}));
	for (const p of pluginConfigBlocklist) {
		const parts = p.split(".");
		let obj: any = cloned;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!obj || typeof obj !== "object") { obj = null; break; }
			obj = obj[parts[i]];
		}
		if (obj && typeof obj === "object") {
			delete obj[parts[parts.length - 1]];
		}
	}
	return cloned;
};

const initPlugins = async (tenant: string): Promise<boolean> => {

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

	// Only load plugins explicitly listed in config.plugins.list. Filenames
	// must match a strict identifier and the file's basename must equal the
	// listed plugin name; anything else is ignored (defense against
	// arbitrary .js dropped in the plugins folder).
	for (const p of fs.readdirSync(pluginsPath)) {
		if (p.split('.').pop() !== "js") continue;

		const baseName = p.replace(/\.js$/, "");
		if (!/^[A-Za-z0-9_-]+$/.test(baseName)) {
			logger.warn(`initPlugins - Skipping plugin file with non-standard name: ${p}`);
			continue;
		}
		if (!(baseName in pluginList)) {
			logger.warn(`initPlugins - Plugin '${baseName}' not in config.plugins.list, skipping`);
			continue;
		}

		logger.info(`initPlugins - Found plugin: ${p}`);
		const fullPath = path.join(pluginsPath, p);
		const modulePath = pathToFileURL(fullPath).href;

		try {
			const pluginModule = await import(`${modulePath}?${Date.now()}`);

			if (pluginModule.default && typeof pluginModule.default === 'function') {
				const pluginInstance = pluginModule.default();

				if (pluginInstance && typeof pluginInstance.execute === 'function' && typeof pluginInstance.module === 'string') {

					if (pluginInstance.name !== baseName) {
						logger.warn(`initPlugins - Plugin name '${pluginInstance.name}' does not match filename '${baseName}', skipping`);
						continue;
					}

					if (!pluginStore[tenant]){
						pluginStore[tenant] = [];
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
		config: sanitizePluginConfig(getFullConfig(tenant)),
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