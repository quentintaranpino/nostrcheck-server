import { Application } from "express";
import { logger } from "../lib/logger";
import * as NIP01 from "../lib/nostr/NIP01.js";
import * as NIP19 from "../lib/nostr/NIP19.js";
import * as registered from "../lib/register.js";
import { redisPluginsClient } from "../lib/redis.js";

interface pluginData {
    pubkey: string;
    filename: string;
    ip: string;
}

export interface pluginContext {
    app: Application
    logger: typeof logger;
    redis: typeof redisPluginsClient;
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
    execute: (input: pluginData, context: pluginContext) => Promise<boolean> | boolean;
}

export { pluginData, plugin };