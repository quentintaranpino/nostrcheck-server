import path from "path";
import fs, { promises as fsPromises } from "fs";
import config from "config";
import { exit } from "process";

import { defaultConfig, localPath, necessaryKeys } from "../interfaces/config.js";
import { updateLocalConfigKey } from "../lib/config.js";

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
		const {default: app} = await import("../app.js");
		console.warn("No pubkey found in config file. Generating new pubkey.")
		const { getPubkeyFromSecret } = await import("../lib/nostr/core.js");
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
		const { createkeyPair } = await import("../lib/nostr/core.js");
		const keyPair = await createkeyPair();
		if (keyPair.publicKey && keyPair.secretKey){
			const {default: app} = await import("../app.js");
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

// const migrateFolders = async(mediaPath:string) => {

// 	let folderMigrationData = await dbMultiSelect("SELECT DISTINCT registered.username, registered.hex FROM registered",['username', 'hex'], ['1=1'], false);
// 	if (folderMigrationData == undefined || folderMigrationData == null || folderMigrationData.length == 0){
// 		console.debug("No Data to migrate.");
// 		return;
// 	}

// 	const cantRename : string[] = [];
// 	try {
// 		folderMigrationData.forEach((item) => {
// 		const [oldName, newName] = item.split(',');

// 		const oldPath = path.join(mediaPath, oldName);
// 		const newPath = path.join(mediaPath, newName);

// 		if (fs.existsSync(oldPath)) {
// 			console.debug(`Renaming folder: ${oldPath} to ${newPath}`);
// 			if (fs.existsSync(newPath)) {
// 				console.warn(`Folder with the name ${newName} already exists. Skipping...`);
// 				cantRename.push(oldName + " -> " + newName);
// 			} else {
// 				console.debug(`Renaming folder: ${oldPath} to ${newPath}`);
// 				fs.renameSync(oldPath, newPath);
// 			}
// 		}
// 		});

// 		if (cantRename.length > 0){
// 			cantRename.forEach(element => {
// 				console.warn("Cant rename folder: ", element);
// 			});
// 			console.warn("WARNING", cantRename.length,"- Folders not migrated to new version. Server will shut down to prevent data loss.");
// 			exit(1);
// 		}


// 	} catch (err) {
// 		console.error("Error renaming folders: ", err);
// 		process.exit(1);
// 	}

// }

const migrateDBLocalpath = async () : Promise<boolean> => {

	const { dbMultiSelect, dbUpdate} = await import("../lib/database.js");
	const { default : app } = await import("../app.js");
	const mediaFiles = await dbMultiSelect(
									["filename", "pubkey", "type"],
									"mediafiles",
									"(localpath IS NULL or localpath = '') ORDER BY id DESC",
									['1=1'], 
									false);

	if (mediaFiles == undefined || mediaFiles == null || mediaFiles.length == 0){
        return false;
    }

	console.log("Migrating", mediaFiles.length, "files", "to new localpath folder version, it can take a while...");
	
	let count = 0;
	for (const item of mediaFiles) {
		let { filename, pubkey, type } = item;
		console.log(`### - Processing file ${count} of ${mediaFiles.length} - ${filename} - ${pubkey}`);
 
		if (filename.includes("avatar") || filename.includes("banner")) {
			const newType = filename.includes("avatar") ? "avatar" : "banner";
			console.log('Trying to update database with new type:', newType, 'for', filename, 'and pubkey', pubkey);
			const updType = await dbUpdate('mediafiles', 'type', newType, ['filename', 'pubkey'], [filename, pubkey]);
			if (!updType) {
				console.error(`Failed to update media file ${filename} with type ${newType}`);
				continue;
			}
			const newPath = path.join(app.get("config.storage")["local"]["mediaPath"], pubkey, filename);
			console.log('Checking if file exists:', newPath);
			if (!fs.existsSync(newPath)) {
				console.error(`File not found: ${newPath}`);
				await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);
				continue;
			}
			const { generatefileHashfromfile } = await import("../lib/hash.js");
			const newFilename = await generatefileHashfromfile(newPath) + path.extname(filename);
			console.log('Generated new filename:', newFilename);
			if (!newFilename || newFilename === path.extname(filename)) {
				console.error(`Failed to generate new filename for ${filename}`);
				await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);

				continue;
			}
			console.log('Trying to update database with new filename:', newFilename, 'for', filename, 'and pubkey', pubkey);	
			const updFilename = await dbUpdate('mediafiles', 'filename', newFilename, ['filename', 'pubkey'], [filename, pubkey]);
			if (!updFilename) {
				console.error(`Failed to update media file ${filename} with new filename`);
				await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);
				continue;
			}
			try{
				console.log('Trying to rename file:', newPath, 'to', path.join(app.get("config.storage")["local"]["mediaPath"], pubkey, newFilename));
				await fs.rename(path.join(app.get("config.storage")["local"]["mediaPath"], pubkey, filename),
								path.join(app.get("config.storage")["local"]["mediaPath"], pubkey, newFilename), async (err) => {
					if (err) {
						console.error(`Failed to rename ${newType} file to ${newFilename}: ${err}`);
						await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);

					} else {
						console.log(`Renamed ${newType} file to ${newFilename}`);
					}
				});
				filename = newFilename;
			}catch (error) {
				console.error(`Failed to rename ${newType} file to ${newFilename}: ${error}`);
				await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);
				continue;
			}
		}else{
			if (!type){
				console.log('Trying to update database with type "media" for', filename, 'and pubkey', pubkey);
				const updtType = await dbUpdate('mediafiles', 'type', "media", ['filename', 'pubkey'], [filename, pubkey]);
				if (!updtType) {
					console.error(`Failed to update media file ${filename} with type media`);
					await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);
					continue;
				}
			}
		}

		const { getHashedPath } = await import("../lib/hash.js");
		const hashpath = await getHashedPath(filename);
        const updLocalPath = await dbUpdate('mediafiles', 'localpath', hashpath, ['filename', 'pubkey'], [filename, pubkey]);

		if (!updLocalPath) {
			console.error(`Failed to update media file ${filename} with hashpath ${hashpath}`);
			await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);
			continue;
		};

		const oldPath = path.join(app.get("config.storage")["local"]["mediaPath"], pubkey, filename);
		const newPath = path.join(app.get("config.storage")["local"]["mediaPath"], hashpath, filename);

		try {

			if (!fs.existsSync(path.join(app.get("config.storage")["local"]["mediaPath"], hashpath))) {
				fs.mkdirSync(path.join(app.get("config.storage")["local"]["mediaPath"], hashpath));
			}
            await fs.rename(oldPath, newPath, async (err) => {
				if (err) {
					console.error(`Failed to move file ${filename} to ${newPath}: ${err}`);
					await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);

				} else {
					console.log(`${count} | ${mediaFiles.length} - Moved file ${filename} to ${newPath}`);
				}
			});
			count++;


        } catch (error) {
            console.error(`Failed to move file ${filename} to ${newPath}: ${error}`);
			await dbUpdate('mediafiles', 'localpath', null, ['filename', 'pubkey'], [filename, pubkey]);
			continue;
        }
    };

	console.log("Cleaning empty folders...")
	for (const item of mediaFiles) {
		const {filename, pubkey} = item;
		const oldPath = path.join(app.get("config.storage")["local"]["mediaPath"], pubkey);
		try {
			if (fs.existsSync(oldPath) && fs.readdirSync(oldPath).length === 0) {
				fs.rmdirSync(oldPath);
			}
		}
		catch (error) {
			console.error(`Failed to remove empty folder ${oldPath}: ${error}`);
		}
	}

	console.log("Migration complete.");

    return true;
}

const prepareAPPConfig = async(): Promise<boolean> =>{

	if (fs.existsSync(localPath)){
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


const prepareAppFolders = async () => {
    const paths = ["storage.local.tempPath", "storage.local.mediaPath", "logger.logPath"];

    for (const path of paths) {
        if (!config.has(path)) {
            console.error(`${path} is not defined in config file. Check config file.`);
            process.exit(1);
        }

        try {
            await fsPromises.access(config.get(path));
        } catch {
            try {
                await fsPromises.mkdir(config.get(path));
            } catch (err) {
                console.error(`Failed to create directory: ${config.get(path)}`, err);
                process.exit(1);
            }
        }

        if (path === "storage.local.tempPath") {
            const files = await fsPromises.readdir(config.get(path));
            await Promise.all(files.map(file => fsPromises.unlink(`${config.get(path)}${file}`).catch(err => console.error(`Failed to delete file: ${file}`, err))));
        }
    }
}

const prepareApp = async() => {
	await prepareAPPConfig();
	await prepareAppFolders();
}

export { checkConfigNecessaryKeys, prepareApp, migrateDBLocalpath };