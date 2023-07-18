import config from "config";
import {logger} from "./logger.js";
import fs from "fs";
import { exit } from "process";

function prepareAppFolders(){

	let TempPath : string = config.get("media.tempPath");
	logger.info("Cleaning temp dir:", TempPath);

	//If not exist create temp folder
	if (!fs.existsSync(TempPath)){
		fs.mkdirSync(TempPath);
	}

	fs.readdir(TempPath, (err, files) => {
		if (err) {
			logger.fatal(err);
            exit(1);
		}

		for (const file of files) {
			fs.unlink(TempPath + file, (err) => {
				if (err) {
                    logger.error(err);
                    exit(1);
				}
			});
		}
	});

	//If not exist create media folder
	const MediaPath : string = config.get("media.mediaPath");
	if (!fs.existsSync(MediaPath)){
		fs.mkdirSync(MediaPath);
	}

}

function prepareAPPConfig(){

    const DefaultPath : string = "./config/default.json";
    const ConfigPath : string = "./config/local.json";

    //If config file exist return
	if (fs.existsSync(ConfigPath)){
		return
	}

    fs.copyFile(DefaultPath, ConfigPath, function (err) {
        if (err) {
            logger.fatal("An error occured while writing config JSON File.", err);
            exit(1);
        }
     
        logger.info("Creating config file: " + ConfigPath)
		logger.warn("Please edit config file and restart the app.")
		exit(1);
    });


}

export { prepareAppFolders, prepareAPPConfig };