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

const initPlugins = async (app : Application): Promise<boolean> => {
  
  app.set("plugins", []);

  if (!isModuleEnabled("plugins", app)) {
      return Promise.resolve(false);
  }

  if (app.get("config.plugins")["path"] === undefined) {
      logger.error("No plugins path defined in config");
      return Promise.resolve(false);
  }

  const pluginsPath = getLocalFolder(app.get("config.plugins")["path"]);
  if (!pluginsPath) {
      return Promise.resolve(false);
  }

  for (const p of fs.readdirSync(pluginsPath)) {
      if (p.split('.').pop() !== "js") continue;
      logger.debug(`Loading plugin: ${p}`);
      const fullPath = path.join(pluginsPath, p);
      const modulePath = pathToFileURL(fullPath).href;

      try {

        const pluginModule = await import(`${modulePath}?${Date.now()}`); 

        if (pluginModule.default && typeof pluginModule.default === 'function') {
            const pluginInstance = pluginModule.default();
            if (pluginInstance && typeof pluginInstance.execute === 'function') {
                app.get("plugins").push(pluginInstance);
                logger.info(`Plugin ${p} loaded successfully`);
            } else {
                logger.warn(`Plugin ${p} does not provide a valid structure (missing 'execute' function)`);
            }
        } else {
            logger.warn(`Plugin ${p} does not export a default function`);
        }
      } catch (err) {
          logger.error(`Error loading plugin ${p}`);
      }
  }

  return Promise.resolve(true);
}

const listPlugins = (app: Application): string[] => {
    return app.get("plugins").map((p: { order: number, enabled: boolean, name: string }) => ({ order: p.order, enabled: p.enabled, name: p.name }));
}

const executePlugins = async (input : pluginData, app : Application) : Promise<boolean> => {

  if (!isModuleEnabled("plugins", app)) return Promise.resolve(false)
    const plugins: plugin[] = app.get("plugins").sort((a : plugin, b: plugin) => a.order - b.order);

  let result = false;

  const context : pluginContext = {
    app: app,
    logger: logger,
    nostr: {
        NIP01: NIP01,
        NIP19: NIP19
    },
    registered: registered
  }

  logger.debug(`Executing plugins for ${JSON.stringify(input)}`);
  for (const plugin of plugins) {
    if (plugin.enabled != true) continue;
      try {
          logger.info(`Executing plugin ${plugin.name}`);
          result = await plugin.execute(input, context);
          if (typeof result !== 'boolean') result = false;
          logger.debug(`Plugin ${plugin.name} returned ${result}`);
      } catch (err) {
          logger.error(`Error executing plugin ${plugin.name}`);
          result = false;
      }
  }

  return Promise.resolve(result);

}

export { initPlugins, listPlugins, executePlugins };