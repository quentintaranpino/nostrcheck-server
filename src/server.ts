import app from "./app.js";
import { showDBStats } from "./lib/database.js";
import { loadConsoleBanner } from "./lib/server.js";

// Start Express server.
const server = app.listen(app.get("port"), async () => {
	
	// Show server startup message
	loadConsoleBanner(app);

	// Show server startup stactics
	showDBStats();

});

export default server;