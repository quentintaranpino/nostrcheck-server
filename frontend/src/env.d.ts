/// <reference types="astro/client" />

// Injected by the Express mount (src/lib/frontend/astro.ts) per request.
type PageSeo = {
	title: string;
	description: string;
	noindex: boolean;
	socialImage: string;
	siteName: string;
};

declare namespace App {
	interface Locals {
		host: string;
		getSeo: (page: string) => PageSeo;
	}
}
