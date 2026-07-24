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
		siteName: string;
		version: string;
		loggedIn: boolean;
		isAdmin: boolean;
		modules: { register: boolean; media: boolean; relay: boolean };
		getSeo: (page: string) => PageSeo;
		getMdPage: (page: 'tos' | 'privacy' | 'legal') => string;
	}
}
