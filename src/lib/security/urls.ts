import dns from "dns";
import { isIP } from "net";
import { logger } from "../logger.js";


/**
 * Returns true if a given IPv4 address points to a private/internal range
 * that should never be the target of an outbound fetch from this server.
 *
 * Covers loopback, RFC1918, link-local (AWS / GCP / Azure metadata at
 * 169.254.169.254), CGNAT and multicast. Not exhaustive but covers the
 * well-known SSRF targets.
 */
const isPrivateIPv4 = (ip: string): boolean => {
	const parts = ip.split(".").map(Number);
	if (parts.length != 4 || parts.some(n => isNaN(n))) return true;
	const [a, b] = parts;

	if (a == 0) return true;                       // "this host" 0.0.0.0/8
	if (a == 127) return true;                     // loopback 127.0.0.0/8
	if (a == 10) return true;                      // RFC1918
	if (a == 172 && b >= 16 && b <= 31) return true;  // RFC1918
	if (a == 192 && b == 168) return true;         // RFC1918
	if (a == 169 && b == 254) return true;         // link-local + cloud metadata
	if (a == 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
	if (a >= 224) return true;                     // multicast + reserved

	return false;
};

/**
 * Returns true if a given IPv6 address points to a private/internal range.
 * Handles loopback, link-local, unique local, multicast, and IPv4-mapped.
 */
const isPrivateIPv6 = (ip: string): boolean => {
	const lc = ip.toLowerCase();

	if (lc == "::1" || lc == "::") return true;                     // loopback / unspecified
	if (lc.startsWith("fe8") || lc.startsWith("fe9") ||
	    lc.startsWith("fea") || lc.startsWith("feb")) return true;   // link-local fe80::/10
	if (lc.startsWith("fc") || lc.startsWith("fd")) return true;     // unique local fc00::/7
	if (lc.startsWith("ff")) return true;                            // multicast ff00::/8

	// IPv4-mapped ::ffff:a.b.c.d — check the v4 part
	if (lc.startsWith("::ffff:")) {
		const v4 = lc.substring(7);
		if (isIP(v4) == 4) return isPrivateIPv4(v4);
	}

	return false;
};

/**
 * Returns true if the given URL is safe to fetch from this server.
 *
 * Rejects:
 *  - Non http(s) schemes (file://, gopher://, etc.).
 *  - URL literals that already point to a private/internal IP.
 *  - Hostnames that resolve (via DNS) to any private/internal IP.
 *
 * Note: this does not block DNS rebinding attacks where the resolver
 * returns a public IP first and a private one on the second lookup
 * during the actual fetch. A future hardening step would pin the
 * resolved IP for the fetch itself.
 */
const isPublicUrl = async (rawUrl: string): Promise<boolean> => {

	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		logger.warn(`isPublicUrl - Invalid URL: ${rawUrl}`);
		return false;
	}

	if (parsed.protocol != "http:" && parsed.protocol != "https:") {
		logger.warn(`isPublicUrl - Rejected non http(s) scheme: ${parsed.protocol} | ${rawUrl}`);
		return false;
	}

	const hostname = parsed.hostname;
	if (hostname == "" || hostname == null) {
		logger.warn(`isPublicUrl - Empty hostname: ${rawUrl}`);
		return false;
	}

	// If the hostname is already an IP literal, check it directly.
	const ipVersion = isIP(hostname);
	if (ipVersion == 4) {
		if (isPrivateIPv4(hostname)) {
			logger.warn(`isPublicUrl - Refused private IPv4 literal: ${hostname}`);
			return false;
		}
		return true;
	}
	if (ipVersion == 6) {
		if (isPrivateIPv6(hostname)) {
			logger.warn(`isPublicUrl - Refused private IPv6 literal: ${hostname}`);
			return false;
		}
		return true;
	}

	// Otherwise resolve DNS to all addresses and reject if any is private.
	try {
		const addresses = await dns.promises.lookup(hostname, { all: true });
		for (const { address, family } of addresses) {
			const priv = family == 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
			if (priv) {
				logger.warn(`isPublicUrl - Hostname ${hostname} resolves to private ${address}`);
				return false;
			}
		}
		return true;
	} catch (error) {
		logger.warn(`isPublicUrl - DNS lookup failed for ${hostname}: ${error}`);
		return false;
	}
};

export { isPublicUrl };
