import axios from "axios";
import app from "../app.js";

const getLatestVersion = async () : Promise<string> => {

	try {
		const response = await axios.get(app.get("config.server")["updateSource"]);
		const packageJson = response.data;
	
		return packageJson.version;

	  } catch (error) {
		console.error(`Cannot get latest version from ${app.get("config.server")["updateSource"]}`);
		return process.env.npm_package_version || "";
	  }
}

console.log(await getLatestVersion());

export { getLatestVersion };