import { logger } from "../logger.js";
import { getConfig } from "../config/core.js";
import { AuditPayload, AuditResult, ExternalReporter } from "../../interfaces/audit.js";

/**
 * Placeholder implementation of the external reporting contract.
 *
 * Reporting to an authority (NCMEC's CyberTipline is the reference case) is not
 * an HTTP call away: it requires prior registration as an Electronic Service
 * Provider, signed agreements and a human reviewing every submission. An NSFW
 * classifier or a stranger's report tag does not get to file one. So this is
 * the hole and the contract only, and config keeps it off.
 */
const noopReporter: ExternalReporter = {
	name: "noop",
	enabled: false,
	report: async (payload: AuditPayload): Promise<AuditResult> => {
		logger.debug(`noopReporter - External reporting is not implemented, event ${payload.id} (${payload.eventtype}) was not reported to any authority`);
		return { status: "skipped", message: "External reporting is not implemented" };
	}
}

/**
 * Returns the reporter for a tenant. Always the noop one, with `enabled` taken
 * from config so a future provider can be swapped in here without touching any
 * call site.
 */
const getReporter = (tenant?: string): ExternalReporter => {

	const enabled = getConfig(tenant || null, ["notifications", "reporter", "enabled"]) == true;
	const provider = getConfig(tenant || null, ["notifications", "reporter", "provider"]) || "noop";

	if (enabled && provider != "noop") {
		logger.warn(`getReporter - Reporter '${provider}' is enabled in config but no implementation is registered, falling back to noop`);
	}

	return { ...noopReporter, enabled: enabled };
}

export { getReporter, noopReporter };
