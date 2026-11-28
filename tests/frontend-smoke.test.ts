import { describe, it, expect } from "vitest";
import http from "http";

// Smoke test for the public pages, against a live server like the rest of
// the suite. Grows with every phase of the frontend refactor.
//   SMOKE_BASE   where the server listens (default http://localhost:3000)
//   SMOKE_HOSTS  comma separated tenant hosts to ask for (default: the host in SMOKE_BASE)
const BASE = new URL(process.env.SMOKE_BASE || "http://localhost:3000");
const HOSTS = (process.env.SMOKE_HOSTS || BASE.hostname).split(",").map(h => h.trim()).filter(h => h != "");

// Pages on the v8 layout. They must not reference anything outside the host.
const V8_PAGES = ["/tools", "/tos", "/privacy", "/legal"];

interface Reply { status: number; headers: http.IncomingHttpHeaders; body: string }

// fetch() can't set Host, and the tenant is picked from it.
const get = (path: string, host: string): Promise<Reply> => {
	return new Promise((resolve, reject) => {
		const req = http.request({
			hostname: BASE.hostname,
			port: BASE.port || 80,
			path,
			method: "GET",
			headers: { "Host": host, "X-Forwarded-Proto": "https" },
		}, res => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", chunk => { body += chunk; });
			res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
		});
		req.on("error", reject);
		req.end();
	});
};

// Every URL the document makes the browser fetch.
const fetchedUrls = (html: string): string[] => {
	const urls: string[] = [];
	for (const m of html.matchAll(/<(?:script|img|source|iframe)\b[^>]*?\ssrc="([^"]+)"/g)) urls.push(m[1]);
	for (const m of html.matchAll(/<link\b[^>]*?\srel="(?:stylesheet|modulepreload|preload|preconnect|dns-prefetch|icon|apple-touch-icon|manifest)"[^>]*?\shref="([^"]+)"/g)) urls.push(m[1]);
	for (const m of html.matchAll(/<use\b[^>]*?\shref="([^"]+)"/g)) urls.push(m[1]);
	return urls;
};

describe.each(HOSTS)("frontend smoke on %s", (host) => {

	it.each(V8_PAGES)("%s renders on the v8 layout with the tenant's SEO", async (page) => {
		const res = await get(page, host);
		expect(res.status).toBe(200);

		const title = /<title>([^<]*)<\/title>/.exec(res.body)?.[1] || "";
		expect(title.trim()).not.toBe("");
		expect(res.body).toContain(`<link rel="canonical" href="https://${host}${page}">`);
		expect(res.body).toContain(`<meta property="og:url" content="https://${host}${page}">`);

		// v8, not legacy: no Bootstrap, no jQuery, nothing from a CDN.
		const urls = fetchedUrls(res.body);
		expect(urls.length).toBeGreaterThan(0);
		expect(urls.filter(u => !u.startsWith("/") || u.startsWith("//"))).toEqual([]);
		expect(res.body).not.toMatch(/jsdelivr|cdnjs|unpkg|bootstrap\.|jquery/i);
		expect(urls.some(u => /^\/assets\/site-[A-Z0-9]+\.css$/.test(u))).toBe(true);
		expect(urls.some(u => /^\/assets\/base-[A-Z0-9]+\.js$/.test(u))).toBe(true);
	}, 20000);

	it("/tools carries the island and its assets resolve, cached as immutable", async () => {
		const res = await get("/tools", host);
		expect(res.body).toContain('data-island="tools"');
		const assets = fetchedUrls(res.body).map(u => u.split("#")[0]).filter(u => u.startsWith("/assets/"));
		expect(assets.length).toBeGreaterThan(3);
		for (const url of new Set(assets)) {
			const asset = await get(url, host);
			expect(asset.status, url).toBe(200);
			expect(String(asset.headers["cache-control"]), url).toContain("immutable");
		}
	}, 20000);

	it("theme.css gives the tenant its hue and an accent for each theme", async () => {
		const res = await get("/static/css/theme.css", host);
		expect(res.status).toBe(200);
		expect(res.body).toMatch(/:root \{ --hue: [\d.]+; --accent: #[0-9a-f]{6}; \}/);
		expect(res.body).toMatch(/html\[data-bs-theme="light"\] \{ --accent: #[0-9a-f]{6}; \}/);
	}, 20000);

	it("/converter moved to /tools for good", async () => {
		for (const path of ["/converter", "/api/v2/converter"]) {
			const res = await get(path, host);
			expect(res.status).toBe(301);
			expect(res.headers.location).toBe("/tools");
		}
	}, 20000);

});
