/// <reference types="astro/client" />

// Injected by the Express mount (src/lib/frontend/astro.ts) per request.
type DocsData = {
	endpoints: { relay: string | null; nip96: string | null; blossom: string | null; nip05: string | null };
	modules: { name: string; path: string; methods: string[]; description: string }[];
	nips: { num: number; label: string; desc: string }[];
	buds: { num: string; desc: string }[];
	luds: { num: string; url: string; desc: string }[];
	relayEnabled: boolean;
	mediaEnabled: boolean;
	lightningEnabled: boolean;
};

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
		getDocsData: () => DocsData;
	}
}
