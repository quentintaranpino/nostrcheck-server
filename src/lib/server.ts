import { Application } from "express";

const serverBanner = (app: Application) : string => {

	const banner : string[] = [];

	banner.push("");
	banner.push("");

	banner.push(
	"███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗"
	);
	banner.push(
		"████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝" 
	);
	banner.push(
		"██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝" 
	);
	banner.push(
		"██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗"  
	);
	banner.push(
		"██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗"
	);
	banner.push(
		"╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝"
	);
	banner.push("");
	banner.push(
		"███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
	);
	banner.push(
		"██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
	);
	banner.push(
		"███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
	);
	banner.push(
		"╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
	);
	banner.push(
		"███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
	);
	banner.push(
		"╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
	);
	banner.push(`Nostrcheck server started, version ${app.get("version")}`);
	banner.push(`Running at http://localhost:${app.get("config.server")["port"]} in ${app.get("config.environment")} mode`);
	banner.push(`Documentation: https://github.com/quentintaranpino/nostrcheck-server/blob/main/DOCS.md`)
	banner.push("");
	banner.push("Press CTRL-C to stop the server");
	banner.push("");

	return banner.join('\r\n').toString();
}

export { serverBanner};