import path from "path";
import fs from "fs";
import { defaultConfig, localPath, necessaryKeys } from "../interfaces/config.js";
import { createkeyPair, getPubkeyFromSecret } from "../lib/nostr/core.js";
import { syncDefaultConfigValues, updateLocalConfigKey } from "../lib/config.js";
import app from "../app.js";
import config from "config";
import { exit } from "process";
import { dbMultiSelect } from "../lib/database.js";
import { mediafilesTableFields } from "../interfaces/database.js";

const checkConfigNecessaryKeys = async () : Promise<void> => {

	let missingFields = [];
	for (const key of necessaryKeys){
		let value = config.get(key);
		if (value === undefined || value === "") {
			let envKey = key.toUpperCase().replace(/\./g, '_');
			value = process.env[envKey];
			console.debug(envKey, process.env[envKey])
			if (value === undefined || value === "") {
				missingFields.push(key);
			}
		}
	}
	
	// Regenerate pubkey if missing and secretkey is present
	if (missingFields.includes("server.pubkey") && !missingFields.includes("server.secretKey")){
		console.warn("No pubkey found in config file. Generating new pubkey.")
		const pubkey = await getPubkeyFromSecret(config.get("server.secretKey"));
		if (pubkey !== "") {
			missingFields = missingFields.filter((field) => field !== "server.pubkey");
			await updateLocalConfigKey("server.pubkey", pubkey);
			let configServer = Object.assign({}, app.get("config.server"));
			configServer.pubkey = pubkey;
			app.set("config.server", configServer);
		}
	}

	// Pubkey and secretkey generation if missing
	if (missingFields.includes("server.pubkey") || missingFields.includes("server.secretKey")){
		console.warn("No pubkey or secret key found in config file. Generating new keys.")
		const keyPair = await createkeyPair();
		if (keyPair.publicKey && keyPair.secretKey){
			missingFields = missingFields.filter((field) => field !== "server.pubkey" && field !== "server.secretKey");
			await updateLocalConfigKey("server.pubkey", keyPair.publicKey) && await updateLocalConfigKey("server.secretKey", keyPair.secretKey);
			let configServer = Object.assign({}, app.get("config.server"));
			configServer.pubkey = keyPair.publicKey;
			configServer.secretKey = keyPair.secretKey;
			app.set("config.server", configServer);
		}
	}

	if (missingFields.length > 0){
		console.error(" ------------------------------------------------------------ ")
		console.error("|  Empty necessary fields in local config file.              |")
		console.error("|  Please edit config file and then restart the app.         |")
		console.error("|  Execute: nano config/local.json                           |")
		console.error(" ------------------------------------------------------------ ")
		console.error(" For more information visit:")
		console.error(" https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/CONFIG.md") 
		console.error(" ")
		console.error(" Missing fields: ");
		missingFields.forEach((field) => {
			console.error(" " + field);
		});
		console.error(" ")
		exit(1);
	}

}

const prepareAppFolders = async() =>{

	// tempPath checks
	const tempPath : string = config.get("media.tempPath");
	if(!tempPath){
		console.error("TempPath is not defined in config file.");
		exit(1);
	}

	if (!fs.existsSync(tempPath)){
		fs.mkdirSync(tempPath);
	}

	fs.readdir(tempPath, (err, files) => {
		if (err) {
			console.error(err);
            exit(1);
		}

		//Delete all files in temp folder
		for (const file of files) {
			fs.unlink(tempPath + file, (err) => {
				if (err) {
                    console.error(err);
                    exit(1);
				}
			});
		}
	});

	// mediaPath checks
	const mediaPath : string = config.get("media.mediaPath");
	if (!mediaPath){
		console.error("MediaPath is not defined in config file.");
		exit(1);
	}
	if (!fs.existsSync(mediaPath)){
		fs.mkdirSync(mediaPath);
	}


	let folderMigrationData = await dbMultiSelect("SELECT DISTINCT registered.username, registered.hex FROM registered",['username', 'hex'], ['1=1'], mediafilesTableFields, false);
	if (folderMigrationData == undefined || folderMigrationData == null || folderMigrationData.length == 0){
		console.debug("No Data to migrate.");
		return;
	}

	const cantRename : string[] = [];
	try {
		folderMigrationData.forEach((item) => {
		const [oldName, newName] = item.split(',');

		const oldPath = path.join(mediaPath, oldName);
		const newPath = path.join(mediaPath, newName);

		if (fs.existsSync(oldPath)) {
			console.debug(`Renaming folder: ${oldPath} to ${newPath}`);
			if (fs.existsSync(newPath)) {
				console.warn(`Folder with the name ${newName} already exists. Skipping...`);
				cantRename.push(oldName + " -> " + newName);
			} else {
				console.debug(`Renaming folder: ${oldPath} to ${newPath}`);
				fs.renameSync(oldPath, newPath);
			}
		}
		});

		if (cantRename.length > 0){
			cantRename.forEach(element => {
				console.warn("Cant rename folder: ", element);
			});
			console.warn("WARNING", cantRename.length,"- Folders not migrated to new version. Server will shut down to prevent data loss.");
			exit(1);
		}


	} catch (err) {
		console.error("Error renaming folders: ", err);
		process.exit(1);
	}

}

const prepareAPPConfig = async(): Promise<boolean> =>{

	if (fs.existsSync(localPath)){
        await syncDefaultConfigValues(defaultConfig, localPath);
		await checkConfigNecessaryKeys();
		return true;
	}else{
        console.warn("Local config file not found. Creating new one.");

        try {
            fs.writeFileSync(localPath, JSON.stringify(defaultConfig, null, 2));
            console.info("Creating local config file: " + localPath);
            console.warn("Please edit config file and then restart the app.");
        } catch (err) {
            console.error("An error occured while writing config JSON File.", err);
            process.exit(1);
        }
    }

    return false;
}

const initConfig = () =>{

	console.log("Checking local config file: " + localPath);
	if (!fs.existsSync(localPath)){
        console.warn("Local config file not found. Creating new one.");
        try {
            fs.writeFileSync(localPath, JSON.stringify(defaultConfig, null, 2));
            console.info("Creating local config file: " + localPath);
			console.info("Please edit the file and restart the server");
			process.exit(1);
        } catch (err) {
            console.error("An error occured while writing config JSON File.", err);
            process.exit(1);
        }
    }
}

const prepareApp = async() => {
	await prepareAPPConfig();
	await prepareAppFolders();

}

export { checkConfigNecessaryKeys, prepareApp, initConfig};