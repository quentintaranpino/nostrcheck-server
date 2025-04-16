import { logger } from "../lib/logger";
import * as NIP01 from "../lib/nostr/NIP01.js";
import * as NIP19 from "../lib/nostr/NIP19.js";
import * as registered from "../lib/register.js";
import { RedisService } from "../lib/redis.js";
import { Event } from "nostr-tools";

interface pluginData {
    module: string;
    pubkey?: string;
    filename?: string;
    ip?: string;
    event?: Event;
}

interface pluginContext {
    config: Record<string, any>;
    logger: typeof logger;
    redis: RedisService;
    nostr: {
        NIP01: typeof NIP01;
        NIP19: typeof NIP19;
    },
    registered: typeof registered;
}

interface plugin {
    order: number;
    enabled: boolean;
    name: string;
    module: string;
    execute: (input: pluginData, context: pluginContext) => Promise<boolean> | boolean;
}

interface PluginStore {
    [tenant: string]: plugin[];
}

const pluginStore: PluginStore = {};

export { pluginData, plugin, pluginContext, pluginStore };