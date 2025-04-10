import config from "config";
import fs from "fs";
import { exit } from "process";
import { Application } from "express";
import { Module, Modules } from "../../interfaces/config.js";
import { localPath } from "../../interfaces/config.js";

const syncDefaultConfigValues = async (defaultConf : Record<string,any>, localConf: string) : Promise<boolean> => {

	//Compare default config with local config json files
	const LocalConfig = JSON.parse(fs.readFileSync(localConf).toString());
	
	const configChanged = await mergeConfigkey(defaultConf, LocalConfig);
	if (!configChanged) return false;
	
	try{
		console.debug("Updating config file: " + localConf)
		fs.copyFileSync(localConf, localConf + ".bak");
		fs.writeFileSync(localConf, JSON.stringify(LocalConfig, null, 4));
		return true;
	}catch(err){
		console.error("Error writing config file: ", err);
		console.error("Please make sure the file is writable and then restart the server")
		exit(1);
	}
	
};

let hasChanged = false;
const mergeConfigkey = async (defaultConfig: Record<string, unknown>, localConfig: Record<string, unknown>): Promise<boolean> => {
    const promises = [];

    for (const key in defaultConfig) {
        if (typeof defaultConfig[key] === 'object' && defaultConfig[key] !== null && !Array.isArray(defaultConfig[key])) {
            if (!localConfig[key]){
                localConfig[key] = {};
                hasChanged = true;
            }
            promises.push(mergeConfigkey(defaultConfig[key] as Record<string, unknown>, localConfig[key] as Record<string, unknown>));
        } else if (!Object.prototype.hasOwnProperty.call(localConfig, key)) {
            localConfig[key] = defaultConfig[key];
            console.warn("Missing config key: " + key + " - Adding default value:", defaultConfig[key]);
            hasChanged = true;
        }
    }

    await Promise.all(promises);
    return hasChanged;
}

const updateLocalConfigKey = async (key: string, value: string | number | boolean | object): Promise<boolean> => {
    try {
        const LocalConfig = JSON.parse(fs.readFileSync(localPath).toString());
        const keyParts = key.split(".");
        let currentPart = LocalConfig;

        for (let i = 0; i < keyParts.length - 1; i++) {
            if (!currentPart[keyParts[i]]) {
                currentPart[keyParts[i]] = {};
            }
            currentPart = currentPart[keyParts[i]];
        }

        currentPart[keyParts[keyParts.length - 1]] = value;

        console.debug("Updating config file: " + localPath + " with key: " + key + " and value: ", value);
        fs.copyFileSync(localPath, localPath + ".bak");
        fs.writeFileSync(localPath, JSON.stringify(LocalConfig, null, 4));

        return true;
    } catch (err) {
        console.error("Error writing config file: ", err);
        return false;
    }
};

const loadConfigOptions = async (section:string) : Promise<Modules> => {
	try{
		return JSON.parse(JSON.stringify(config.get(section)));
	}catch(err){
		console.error("Error loading config options: ", err);
		return {};
	}
}

export { 
	updateLocalConfigKey, 
	syncDefaultConfigValues,
	loadConfigOptions,
};
