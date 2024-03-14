import { Application } from "express";

const loadConsoleBanner = (app: Application) : void => {

    console.log("");
	console.log("");

	console.log(
	"███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗"
	);
	console.log(
		"████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝" 
	);
	console.log(
		"██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝" 
	);
	console.log(
		"██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗"  
	);
	console.log(
		"██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗"
	);
	console.log(
		"╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝"
	);
	console.log("");
	console.log(
		"███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
	);
	console.log(
		"██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
	);
	console.log(
		"███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
	);
	console.log(
		"╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
	);
	console.log(
		"███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
	);
	console.log(
		"╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
	);
	console.log("Nostrcheck server started, version %s", app.get("version"));
	console.log("Running at http://" + app.get("config.server")["host"] + " - " + app.get("env"), "mode");
	console.log("Press CTRL-C to exit\n");
}

export { loadConsoleBanner};