interface registeredTableResponse {
	usernames: [JSON];
}

interface localUserMetadata {
	hostedFiles : number;
	usernames : JSON[];
	pubkey : string;
	npub: string;
	lud16: string;
}

interface Page {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const sitemapPages: Page[] = [
	{
		path: "/",
		lastmod: new Date().toISOString(),
		changefreq: "daily",
		priority: 1.0
	},
	{
		path: "/register",
		lastmod: new Date().toISOString(),
		changefreq: "monthly",
		priority: 0.8
	},
	{
		path: "/gallery",
		lastmod: new Date().toISOString(),
		changefreq: "daily",
		priority: 0.5
	},
	{
		path: "/media",
		lastmod: new Date().toISOString(),
		changefreq: "monthly",
		priority: 0.0
	},
	{
		path: "/documentation",
		lastmod: new Date().toISOString(),
		changefreq: "daily",
		priority: 0.0
	},
	{
		path: "/directory",
		lastmod: new Date().toISOString(),
		changefreq: "daily",
		priority: 0.0
	},
	{
		path: "/relay",
		lastmod: new Date().toISOString(),
		changefreq: "daily",
		priority: 0.0
	},
	{
		path: "/comverter",
		lastmod: new Date().toISOString(),
		changefreq: "monthly",
		priority: 0.0
	},
	{
		path: "/privacy",
		lastmod: new Date().toISOString(),
		changefreq: "weekly",
		priority: 0.0
	},
	{
		path: "/tos",
		lastmod: new Date().toISOString(),
		changefreq: "weekly",
		priority: 0.0
	},
	{
		path: "/legal",
		lastmod: new Date().toISOString(),
		changefreq: "weekly",
		priority: 0.0
	},
	{
		path: "/login",
		lastmod: new Date().toISOString(),
		changefreq: "weekly",
		priority: 0.0
	}
]

export { registeredTableResponse, localUserMetadata, Page, sitemapPages };